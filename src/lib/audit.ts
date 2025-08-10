import EventEmitter from "events";
import got from "got";
import * as cheerio from "cheerio";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { prisma } from "@/lib/prisma";
import {
  fetchPageSpeedScores,
  fetchWordPressInfo,
  fetchVulnerabilities,
  checkXmlRpc,
  checkUserEnumeration,
  robotsTxtExists,
  sitemapExists,
  checkDirectoryListing,
  checkWpConfigBackup,
  fetchLatestVersion,
  fetchStructuredData,
  checkSafeBrowsing,
} from "@/lib/tools";
import { fetchSslInfo, fetchSslLabs } from "@/lib/ssl";
import { checkBrokenLinks, checkBrokenImages } from "./links";
import { crawl } from "./crawler";

const emitters = new Map<string, EventEmitter>();

function progress(emitter: EventEmitter, step: string, message: string) {
  emitter.emit("progress", { step, message });
}

interface WpEntity {
  slug?: string;
  id?: string | number;
  name?: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function startAudit(url: string): Promise<string> {
  const audit = await prisma.audit.create({
    data: { url, status: "queued" },
  });
  const emitter = new EventEmitter();
  emitters.set(audit.id, emitter);
  process(audit.id, url, emitter).catch((e) => console.error(e));
  return audit.id;
}

async function process(id: string, url: string, emitter: EventEmitter) {
  try {
    progress(emitter, "fetch", `Fetching ${url}...`);
    await prisma.audit.update({ where: { id }, data: { status: "running" } });
    const res = await got(url, {
      timeout: { request: 12000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    const $ = cheerio.load(res.body);
    const dom = new JSDOM(res.body);
    let axeResults: { violations: { id: string; description: string }[] } = {
      violations: [],
    };
    try {
      // First try direct run (works in tests where axe is mocked)
      axeResults = await (axe as unknown as { run: Function }).run(
        dom.window.document
      );
    } catch {
      // Fallback for Node: inject axe source into JSDOM and run there
      try {
        (dom.window as any).eval((axe as any).source);
        axeResults = await (dom.window as any).axe.run(dom.window.document);
      } catch {
        axeResults = { violations: [] };
      }
    }
    const accessibilityViolationCount = axeResults.violations.length;
    const accessibilityViolations = axeResults.violations
      .slice(0, 10)
      .map((v) => `${v.id}: ${v.description}`);
    const title = $("title").first().text().trim();
    const metaDesc = $('meta[name="description"]').attr("content");
    const canonicalUrl = $('link[rel="canonical"]').attr("href") || null;
    const robotsMeta = $('meta[name="robots"]').attr("content") || null;
    const robotsNoindex = robotsMeta ? /noindex/i.test(robotsMeta) : false;
    const robotsNofollow = robotsMeta ? /nofollow/i.test(robotsMeta) : false;
    const ogTags: Record<string, string> = {};
    $('meta[property^="og:"], meta[name^="og:"]').each((_, el) => {
      const prop = $(el).attr("property") || $(el).attr("name");
      const content = $(el).attr("content");
      if (prop && content) ogTags[prop.toLowerCase()] = content;
    });
    const twitterTags: Record<string, string> = {};
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr("name");
      const content = $(el).attr("content");
      if (name && content) twitterTags[name.toLowerCase()] = content;
    });
    const requiredOg = ["og:title", "og:description", "og:image"];
    const requiredTwitter = [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
    ];
    const missingOpenGraph = requiredOg.filter((t) => !ogTags[t]);
    const missingTwitter = requiredTwitter.filter((t) => !twitterTags[t]);
    const h1Count = $("h1").length;
    const hasMultipleH1 = h1Count !== 1;
    const imagesWithoutAlt = $('img:not([alt]), img[alt=""]').length;
    const jsAssetCount = $('script[src]').length;
    const cssAssetCount = $('link[rel="stylesheet"]').length;
    const usesHttps = url.startsWith("https://");
    const setCookie = res.headers["set-cookie"];
    const cookieArr = Array.isArray(setCookie)
      ? setCookie
      : setCookie
      ? [setCookie]
      : [];
    let cookiesMissingSecure = 0;
    let cookiesMissingHttpOnly = 0;
    for (const c of cookieArr) {
      const lower = c.toLowerCase();
      if (!lower.includes("secure")) cookiesMissingSecure++;
      if (!lower.includes("httponly")) cookiesMissingHttpOnly++;
    }
    const mixedContent: string[] = [];
    if (usesHttps) {
      $(
        'script[src], link[href], img[src], iframe[src]'
      ).each((_, el) => {
        const srcAttr = $(el).attr("src") || $(el).attr("href");
        if (srcAttr && srcAttr.startsWith("http://")) mixedContent.push(srcAttr);
      });
    }
    const ttfb = res.timings?.phases.firstByte ?? null;
    const httpVersion = res.httpVersion;
    const supportsHttp3 = /h3/i.test(
      Array.isArray(res.headers["alt-svc"])
        ? res.headers["alt-svc"].join(",")
        : String(res.headers["alt-svc"] || "")
    );
    const compression = Array.isArray(res.headers["content-encoding"])
      ? res.headers["content-encoding"].join(",")
      : (res.headers["content-encoding"] as string | undefined) || null;
    const cacheControl = Array.isArray(res.headers["cache-control"])
      ? res.headers["cache-control"].join(",")
      : (res.headers["cache-control"] as string | undefined) || null;
    const expires = Array.isArray(res.headers["expires"])
      ? res.headers["expires"].join(",")
      : (res.headers["expires"] as string | undefined) || null;
    const requiredSecurityHeaders = [
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "strict-transport-security",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "cross-origin-embedder-policy",
    ];
    const recommendedSecurityHeaderValues: Record<string, string[]> = {
      "x-frame-options": ["deny", "sameorigin"],
      "x-content-type-options": ["nosniff"],
      "cross-origin-opener-policy": ["same-origin"],
      "cross-origin-embedder-policy": ["require-corp"],
    };
    const missingSecurityHeaders = requiredSecurityHeaders.filter(
      (h) => !res.headers[h as keyof typeof res.headers]
    );
    const misconfiguredSecurityHeaders = Object.entries(
      recommendedSecurityHeaderValues
    )
      .filter(([header, values]) => {
        const actual = res.headers[header as keyof typeof res.headers];
        if (!actual) return false;
        const lower = Array.isArray(actual)
          ? actual.join(",").toLowerCase()
          : String(actual).toLowerCase();
        return !values.some((v) => lower.includes(v));
      })
      .map(([header]) => header);
    const sslInfo = usesHttps ? await fetchSslInfo(url) : null;
    const sslLabs = usesHttps ? await fetchSslLabs(url) : null;
    progress(emitter, "crawl", "Crawling additional pages...");
    const pageSamples = await crawl(url, res.body);

    const pluginSlugs = new Set<string>();
    const themeSlugs = new Set<string>();
    const pluginInfo = new Map<string, { version?: string }>();
    const themeInfo = new Map<string, { version?: string }>();
    for (const match of res.body.matchAll(
      /wp-content\/plugins\/([a-z0-9-]+)[^"'\s]*?ver=([0-9.]+)/gi
    )) {
      pluginSlugs.add(match[1]);
      pluginInfo.set(match[1], { version: match[2] });
    }
    for (const match of res.body.matchAll(/wp-content\/plugins\/([a-z0-9-]+)/gi)) {
      const slug = match[1];
      pluginSlugs.add(slug);
      if (!pluginInfo.has(slug)) pluginInfo.set(slug, {});
    }
    for (const match of res.body.matchAll(
      /wp-content\/themes\/([a-z0-9-]+)[^"'\s]*?ver=([0-9.]+)/gi
    )) {
      themeSlugs.add(match[1]);
      themeInfo.set(match[1], { version: match[2] });
    }
    for (const match of res.body.matchAll(/wp-content\/themes\/([a-z0-9-]+)/gi)) {
      const slug = match[1];
      themeSlugs.add(slug);
      if (!themeInfo.has(slug)) themeInfo.set(slug, {});
    }
    try {
      const pluginsApi = await got(new URL("/wp-json/wp/v2/plugins", url).toString(), {
        timeout: { request: 8000 },
        retry: { limit: 1 },
        headers: { "user-agent": "WP-Audit-Chat" },
      }).json<WpEntity[]>();
      for (const p of pluginsApi) {
        const slug = p?.slug || p?.id || p?.name;
        if (typeof slug === "string") {
          pluginSlugs.add(slug);
          const version = (p as WpEntity & { version?: string }).version;
          if (!pluginInfo.has(slug)) pluginInfo.set(slug, {});
          if (typeof version === "string")
            pluginInfo.get(slug)!.version = version;
        }
      }
    } catch {
      // ignore
    }
    try {
      const themesApi = await got(new URL("/wp-json/wp/v2/themes", url).toString(), {
        timeout: { request: 8000 },
        retry: { limit: 1 },
        headers: { "user-agent": "WP-Audit-Chat" },
      }).json<WpEntity[]>();
      for (const t of themesApi) {
        const slug = t?.slug || t?.id || t?.name;
        if (typeof slug === "string") {
          themeSlugs.add(slug);
          const version = (t as WpEntity & { version?: string }).version;
          if (!themeInfo.has(slug)) themeInfo.set(slug, {});
          if (typeof version === "string")
            themeInfo.get(slug)!.version = version;
        }
      }
    } catch {
      // ignore
    }
    progress(emitter, "links", "Checking for broken links...");
    const { broken: brokenLinks } = await checkBrokenLinks(url, res.body);
    progress(emitter, "images", "Checking for broken images...");
    const { broken: brokenImages } = await checkBrokenImages(url, res.body);
    progress(emitter, "safe-browsing", "Checking Google Safe Browsing...");
    const safeBrowsingThreats = await checkSafeBrowsing(url);
    progress(emitter, "wordpress", "Checking WordPress info...");
    const [
      wpInfo,
      robotsTxtPresent,
      sitemapPresent,
      pluginVulns,
      themeVulns,
      xmlRpcEnabled,
      userEnumerationEnabled,
      directoryListing,
      wpConfigBakExposed,
      structuredData,
    ] = await Promise.all([
      fetchWordPressInfo(url),
      robotsTxtExists(url),
      sitemapExists(url),
      fetchVulnerabilities("plugin", pluginSlugs),
      fetchVulnerabilities("theme", themeSlugs),
      checkXmlRpc(url),
      checkUserEnumeration(url),
      checkDirectoryListing(url),
      checkWpConfigBackup(url),
      fetchStructuredData(url),
    ]);

    const pluginDetails = await Promise.all(
      Array.from(pluginSlugs).map(async (slug) => {
        const installed = pluginInfo.get(slug)?.version;
        const latest = await fetchLatestVersion("plugin", slug);
        const outdated = installed && latest ? compareVersions(installed, latest) < 0 : false;
        return { slug, version: installed ?? null, latestVersion: latest, outdated };
      })
    );
    const themeDetails = await Promise.all(
      Array.from(themeSlugs).map(async (slug) => {
        const installed = themeInfo.get(slug)?.version;
        const latest = await fetchLatestVersion("theme", slug);
        const outdated = installed && latest ? compareVersions(installed, latest) < 0 : false;
        return { slug, version: installed ?? null, latestVersion: latest, outdated };
      })
    );
    progress(emitter, "pagespeed", "Fetching PageSpeed Insights...");
    const psi = await fetchPageSpeedScores(url);
    if (pageSamples.length) {
      await prisma.pageSample.createMany({
        data: pageSamples.map((p) => ({ ...p, auditId: id })),
      });
    }
    const data = {
      status: res.statusCode,
      title,
      metaDescPresent: Boolean(metaDesc),
      canonicalUrl,
      robotsMeta,
      robotsNoindex,
      robotsNofollow,
      openGraph: ogTags,
      twitterCard: twitterTags,
      missingOpenGraph,
      missingTwitter,
      h1Count,
      hasMultipleH1,
      imagesWithoutAlt,
      brokenLinkCount: brokenLinks.length,
      brokenLinks,
      brokenImageCount: brokenImages.length,
      brokenImages,
      usesHttps,
      cookiesMissingSecure,
      cookiesMissingHttpOnly,
      mixedContentCount: mixedContent.length,
      mixedContent: mixedContent.slice(0, 10),
      ttfb,
      httpVersion,
      supportsHttp3,
      compression,
      cacheControl,
      expires,
      jsAssetCount,
      cssAssetCount,
      robotsTxtPresent,
      sitemapPresent,
      ssl: sslInfo,
      sslLabs,
      accessibilityViolationCount,
      accessibilityViolations,
      missingSecurityHeaders,
      misconfiguredSecurityHeaders,
      xmlRpcEnabled,
      userEnumerationEnabled,
      directoryListing,
      wpConfigBakExposed,
      isWordPress: wpInfo.isWordPress,
      name: wpInfo.name,
      wpVersion: wpInfo.wpVersion,
      isUpToDate: wpInfo.isUpToDate,
      caching: wpInfo.caching,
      plugins: pluginDetails,
      themes: themeDetails,
      vulnerabilities: { plugins: pluginVulns, themes: themeVulns },
      structuredData: structuredData?.items ?? [],
      safeBrowsingThreats,
      ...psi,
      pageSamples,
    };
    await prisma.audit.update({
      where: { id },
      data: { status: "done", summary: JSON.stringify(data) },
    });
    emitter.emit("done", data);
  } catch (e) {
    await prisma.audit.update({
      where: { id },
      data: { status: "error", summary: String(e) },
    });
    emitter.emit("error", { message: String(e) });
  } finally {
    emitter.emit("end");
    emitters.delete(id);
  }
}

export function getEmitter(id: string) {
  return emitters.get(id);
}
