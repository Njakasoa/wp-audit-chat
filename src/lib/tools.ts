import got from "got";

export interface WordPressInfo {
  isWordPress: boolean;
  name?: string;
}

export async function fetchWordPressInfo(siteUrl: string): Promise<WordPressInfo> {
  try {
    const apiUrl = new URL("/wp-json", siteUrl).toString();
    const res = await got(apiUrl, {
      timeout: { request: 8000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    }).json<Record<string, unknown>>();
    const name = res.name;
    if (typeof name === "string") {
      return { isWordPress: true, name };
    }
  } catch {
    // ignore errors
  }
  return { isWordPress: false };
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
