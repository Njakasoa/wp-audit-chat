import got from "got";
import * as cheerio from "cheerio";

export interface PageSample {
  url: string;
  status?: number;
  title?: string | null;
  h1Count?: number;
  metaDescPresent?: boolean;
  canonical?: string | null;
  imgWithoutAltCount?: number;
  jsCount?: number;
  cssCount?: number;
  largestImageBytes?: number;
}

export async function crawl(
  baseUrl: string,
  html: string,
  maxDepth = 1,
  maxPages = 5
): Promise<PageSample[]> {
  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const results: PageSample[] = [];
  const queue: { url: string; depth: number }[] = [];

  const root = cheerio.load(html);
  collectLinks(root, baseUrl, 1);

  function collectLinks(
    $: cheerio.CheerioAPI,
    pageUrl: string,
    depth: number
  ) {
    $("a[href]").each((_, el) => {
      if (results.length + queue.length >= maxPages) return;
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const abs = new URL(href, pageUrl).toString();
        if (!abs.startsWith(origin) || abs === baseUrl) return;
        if (visited.has(abs) || queue.some((q) => q.url === abs)) return;
        queue.push({ url: abs, depth });
      } catch {
        // ignore
      }
    });
  }

  while (queue.length && results.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (depth > maxDepth || visited.has(url)) continue;
    visited.add(url);
    let res;
    try {
      res = await got(url, {
        timeout: { request: 10000 },
        retry: { limit: 1 },
        headers: { "user-agent": "WP-Audit-Chat" },
      });
    } catch (e) {
      const status = (
        e as { response?: { statusCode?: number } }
      ).response?.statusCode;
      results.push({ url, status });
      continue;
    }
    const $ = cheerio.load(res.body);
    const sample: PageSample = {
      url,
      status: res.statusCode,
      title: $("title").first().text().trim() || null,
      h1Count: $("h1").length,
      metaDescPresent: $('meta[name="description"]').length > 0,
      canonical: $('link[rel="canonical"]').attr("href") || null,
      imgWithoutAltCount: $('img:not([alt]), img[alt=""]').length,
      jsCount: $('script[src]').length,
      cssCount: $('link[rel="stylesheet"]').length,
      largestImageBytes: await largestImage($, url),
    };
    results.push(sample);
    if (depth < maxDepth && results.length < maxPages) {
      collectLinks($, url, depth + 1);
    }
  }

  return results;
}

async function largestImage(
  $: cheerio.CheerioAPI,
  pageUrl: string
): Promise<number> {
  let max = 0;
  const imgs = $("img[src]")
    .map((_, el) => $(el).attr("src"))
    .get()
    .filter(Boolean)
    .slice(0, 5);
  for (const src of imgs) {
    try {
      const abs = new URL(src!, pageUrl).toString();
      const head = await got(abs, {
        method: "HEAD",
        throwHttpErrors: false,
        retry: { limit: 1 },
        timeout: { request: 8000 },
      });
      const len = parseInt(head.headers["content-length"] as string) || 0;
      if (len > max) max = len;
    } catch {
      // ignore
    }
  }
  return max;
}

