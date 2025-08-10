import got from "got";
import * as cheerio from "cheerio";

export interface BrokenLinksResult {
  total: number;
  broken: string[];
}

/**
 * Extract anchor tags from HTML and check for broken links.
 * Performs HEAD requests (falling back to GET when necessary) with a
 * concurrency limit. URLs returning 4xx/5xx are reported as broken.
 */
export async function checkBrokenLinks(
  baseUrl: string,
  html: string,
  concurrency = 5
): Promise<BrokenLinksResult> {
  const $ = cheerio.load(html);
  const hrefs = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") {
        hrefs.add(u.toString());
      }
    } catch {
      // ignore invalid URLs
    }
  });

  const urls = Array.from(hrefs);
  const broken: string[] = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = urls[index++];
      try {
        let res = await got(current, {
          method: "HEAD",
          throwHttpErrors: false,
          retry: { limit: 1 },
          timeout: { request: 8000 },
        });
        if (res.statusCode >= 400) {
          if (res.statusCode === 405 || res.statusCode === 501) {
            res = await got(current, {
              method: "GET",
              throwHttpErrors: false,
              retry: { limit: 1 },
              timeout: { request: 8000 },
            });
          }
          if (res.statusCode >= 400) {
            broken.push(current);
          }
        }
      } catch {
        broken.push(current);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { total: urls.length, broken };
}
