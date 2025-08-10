import got from "got";
import * as cheerio from "cheerio";

export interface WordPressInfo {
  isWordPress: boolean;
  name?: string;
  wpVersion?: string;
  isUpToDate?: boolean;
  caching: string[];
}

export async function fetchWordPressInfo(siteUrl: string): Promise<WordPressInfo> {
  let isWordPress = false;
  let name: string | undefined;
  let wpVersion: string | undefined;
  let caching: string[] = [];

  try {
    const apiUrl = new URL("/wp-json", siteUrl).toString();
    const res = await got(apiUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    }).json<Record<string, unknown>>();
    const apiName = res.name;
    if (typeof apiName === "string") {
      name = apiName;
      isWordPress = true;
    }
  } catch {
    // ignore errors
  }

  try {
    const res = await got(siteUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    const $ = cheerio.load(res.body);
    const generator = $('meta[name="generator"]').attr("content");
    if (generator && /wordpress/i.test(generator)) {
      isWordPress = true;
      const match = generator.match(/wordpress\s*([0-9.]+)/i);
      if (match) {
        wpVersion = match[1];
      }
    }
    caching = detectCachingLayers(res.body, res.headers);
  } catch {
    // ignore errors
  }

  let isUpToDate: boolean | undefined;
  if (wpVersion) {
    try {
      const res = await got(
        "https://api.wordpress.org/core/stable-check/1.0/",
        {
          searchParams: { version: wpVersion },
          timeout: { request: 8000 },
          retry: { limit: 1 },
          headers: { "user-agent": "WP-Audit-Chat" },
        }
      ).json<Record<string, string>>();
      isUpToDate = res[wpVersion] === "latest";
    } catch {
      // ignore errors
    }
  }

  return { isWordPress, name, wpVersion, isUpToDate, caching };
}

function detectCachingLayers(
  body: string,
  headers: Record<string, string | string[] | undefined>
): string[] {
  const layers: string[] = [];
  const headerLookup = Object.keys(headers).reduce<Record<string, string>>((acc, key) => {
    const val = headers[key];
    acc[key.toLowerCase()] = Array.isArray(val) ? val.join(",") : String(val);
    return acc;
  }, {});
  if ("x-cache-enabled" in headerLookup) layers.push("WP Rocket");
  if ("x-litespeed-cache" in headerLookup) layers.push("LiteSpeed Cache");
  if ("x-cache" in headerLookup || "x-cache-hits" in headerLookup)
    layers.push("Generic Cache");
  if ("cf-cache-status" in headerLookup) layers.push("Cloudflare");
  if (body.includes("<!-- WP Super Cache -->")) layers.push("WP Super Cache");
  if (body.includes("<!-- Cache Enabler by KeyCDN -->")) layers.push("Cache Enabler");
  if (body.includes("<!-- Cached by WP-Optimize -->")) layers.push("WP-Optimize Cache");
  return layers;
}

export interface PageSpeedScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export async function fetchPageSpeedScores(siteUrl: string): Promise<PageSpeedScores> {
  const scores: PageSpeedScores = {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
  };
  try {
    const searchParams = new URLSearchParams([
      ["url", siteUrl],
      ["category", "performance"],
      ["category", "accessibility"],
      ["category", "best-practices"],
      ["category", "seo"],
    ]);
    if (process.env.PAGESPEED_API_KEY) {
      searchParams.append("key", process.env.PAGESPEED_API_KEY);
    }
    const res = await got("https://www.googleapis.com/pagespeedonline/v5/runPagespeed", {
      searchParams,
      timeout: { request: 15000 },
      retry: { limit: 1 },
    }).json<{ lighthouseResult?: { categories?: Record<string, { score?: number }> } }>();
    const categories = res.lighthouseResult?.categories ?? {};
    const perf = categories.performance?.score;
    const access = categories.accessibility?.score;
    const best = categories["best-practices"]?.score;
    const seo = categories.seo?.score;
    scores.performance = typeof perf === "number" ? perf : null;
    scores.accessibility = typeof access === "number" ? access : null;
    scores.bestPractices = typeof best === "number" ? best : null;
    scores.seo = typeof seo === "number" ? seo : null;
  } catch {
    // ignore errors and return null scores
  }
  return scores;
}

export async function robotsTxtExists(siteUrl: string): Promise<boolean> {
  try {
    const robotsUrl = new URL("/robots.txt", siteUrl).toString();
    await got(robotsUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    return true;
  } catch {
    return false;
  }
}

export async function sitemapExists(siteUrl: string): Promise<boolean> {
  try {
    const sitemapUrl = new URL("/sitemap.xml", siteUrl).toString();
    await got(sitemapUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    return true;
  } catch {
    return false;
  }
}

export interface Vulnerability {
  severity: string | null;
  fixedIn?: string;
  references: string[];
}

interface WpScanApiVulnerability {
  references?: Record<string, unknown>;
  cvss?: { score?: number };
  fixed_in?: string;
}

interface WpScanApiResponse {
  vulnerabilities?: WpScanApiVulnerability[];
}

function scoreToSeverity(score: number): string {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

export async function fetchVulnerabilities(
  type: "plugin" | "theme",
  slugs: Iterable<string>
): Promise<Record<string, Vulnerability[]>> {
  const token =
    process.env.WPSCAN_API_TOKEN || process.env.WPVULNDB_API_TOKEN;
  if (!token) return {};

  const results: Record<string, Vulnerability[]> = {};
  for (const slug of slugs) {
    try {
      const res = await got(
        `https://wpscan.com/api/v3/${type}s/${slug}`,
        {
          headers: {
            Authorization: `Token token=${token}`,
            "user-agent": "WP-Audit-Chat",
          },
          timeout: { request: 8000 },
          retry: { limit: 1 },
        }
      ).json<WpScanApiResponse>();

      const vulns = res.vulnerabilities ?? [];
      results[slug] = vulns.map((v) => {
        const refs: string[] = [];
        const refObj = v.references ?? {};
        for (const val of Object.values(refObj)) {
          if (Array.isArray(val)) {
            refs.push(...val.map(String));
          }
        }
        let severity: string | null = null;
        const score = Number(v.cvss?.score);
        if (!Number.isNaN(score)) {
          severity = scoreToSeverity(score);
        }
        return {
          severity,
          fixedIn: v.fixed_in,
          references: refs,
        } satisfies Vulnerability;
      });
    } catch {
      // ignore errors per slug
    }
  }
  return results;
}

export async function checkXmlRpc(siteUrl: string): Promise<boolean> {
  try {
    const xmlrpcUrl = new URL("/xmlrpc.php", siteUrl).toString();
    const res = await got(xmlrpcUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
      throwHttpErrors: false,
    });
    const body = res.body.toLowerCase();
    if (res.statusCode === 405 || res.statusCode === 200) {
      return body.includes("xml-rpc");
    }
  } catch {
    // ignore errors
  }
  return false;
}

export async function checkUserEnumeration(siteUrl: string): Promise<boolean> {
  try {
    const usersUrl = new URL("/wp-json/wp/v2/users", siteUrl).toString();
    const res = await got(usersUrl, {
      searchParams: { per_page: "1" },
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    }).json<unknown>();
    if (Array.isArray(res) && res.length > 0) {
      const user = res[0];
      return typeof user === "object" && user !== null && "id" in user;
    }
  } catch {
    // ignore errors
  }
  return false;
}
