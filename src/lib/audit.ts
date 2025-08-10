import EventEmitter from "events";
import got from "got";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";
import {
  fetchPageSpeedScores,
  fetchWordPressInfo,
  fetchVulnerabilities,
  robotsTxtExists,
  sitemapExists,
} from "@/lib/tools";
import { fetchSslInfo } from "@/lib/ssl";

const emitters = new Map<string, EventEmitter>();

interface WpEntity {
  slug?: string;
  id?: string | number;
  name?: string;
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
    emitter.emit("progress", { message: "Fetching URL..." });
    await prisma.audit.update({ where: { id }, data: { status: "running" } });
    const res = await got(url, {
      timeout: { request: 12000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    const $ = cheerio.load(res.body);
    const title = $("title").first().text().trim();
    const metaDesc = $('meta[name="description"]').attr("content");
    const h1Count = $("h1").length;
    const imagesWithoutAlt = $('img:not([alt]), img[alt=""]').length;
    const usesHttps = url.startsWith("https://");
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

    const pluginSlugs = new Set<string>();
    const themeSlugs = new Set<string>();
    for (const match of res.body.matchAll(/wp-content\/plugins\/([a-z0-9-]+)/gi)) {
      pluginSlugs.add(match[1]);
    }
    for (const match of res.body.matchAll(/wp-content\/themes\/([a-z0-9-]+)/gi)) {
      themeSlugs.add(match[1]);
    }
    try {
      const pluginsApi = await got(new URL("/wp-json/wp/v2/plugins", url).toString(), {
        timeout: { request: 8000 },
        retry: { limit: 1 },
        headers: { "user-agent": "WP-Audit-Chat" },
      }).json<WpEntity[]>();
      for (const p of pluginsApi) {
        const slug = p?.slug || p?.id || p?.name;
        if (typeof slug === "string") pluginSlugs.add(slug);
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
        if (typeof slug === "string") themeSlugs.add(slug);
      }
    } catch {
      // ignore
    }
    emitter.emit("progress", { message: "Checking WordPress info..." });
    const [
      wpInfo,
      robotsTxtPresent,
      sitemapPresent,
      pluginVulns,
      themeVulns,
    ] = await Promise.all([
      fetchWordPressInfo(url),
      robotsTxtExists(url),
      sitemapExists(url),
      fetchVulnerabilities("plugin", pluginSlugs),
      fetchVulnerabilities("theme", themeSlugs),
    ]);
    emitter.emit("progress", { message: "Fetching PageSpeed Insights..." });
    const psi = await fetchPageSpeedScores(url);
    const data = {
      status: res.statusCode,
      title,
      metaDescPresent: Boolean(metaDesc),
      h1Count,
      imagesWithoutAlt,
      usesHttps,
      robotsTxtPresent,
      sitemapPresent,
      ssl: sslInfo,
      missingSecurityHeaders,
      misconfiguredSecurityHeaders,
      isWordPress: wpInfo.isWordPress,
      name: wpInfo.name,
      wpVersion: wpInfo.wpVersion,
      isUpToDate: wpInfo.isUpToDate,
       plugins: Array.from(pluginSlugs),
       themes: Array.from(themeSlugs),
       vulnerabilities: { plugins: pluginVulns, themes: themeVulns },
      ...psi,
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
