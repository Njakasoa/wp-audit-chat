import { afterEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { brotliCompressSync } from "node:zlib";
import { startAudit, getEmitter } from "./audit";
import {
  fetchLatestVersion,
  checkDirectoryListing,
  checkWpConfigBackup,
  fetchStructuredData,
} from "@/lib/tools";

vi.mock("@/lib/prisma", () => {
  let id = 0;
  return {
    prisma: {
      audit: {
        create: vi.fn().mockImplementation(() => Promise.resolve({ id: `${++id}` })),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

vi.mock("@/lib/tools", async () => {
  const actual = await vi.importActual<typeof import("./tools")>("./tools");
  return {
    ...actual,
    fetchWordPressInfo: vi.fn().mockResolvedValue({ isWordPress: false, caching: [] }),
    fetchPageSpeedScores: vi.fn().mockResolvedValue({}),
    fetchVulnerabilities: vi.fn().mockResolvedValue({}),
    checkXmlRpc: vi.fn().mockResolvedValue(false),
    checkUserEnumeration: vi.fn().mockResolvedValue(false),
    fetchLatestVersion: vi.fn().mockResolvedValue(null),
    checkDirectoryListing: vi.fn().mockResolvedValue(false),
    checkWpConfigBackup: vi.fn().mockResolvedValue(false),
    fetchStructuredData: vi.fn().mockResolvedValue({ items: [] }),
  };
});

const sslMock = vi.hoisted(() => ({
  issuer: "Test CA",
  validFrom: new Date().toISOString(),
  validTo: new Date(Date.now() + 86400000).toISOString(),
  daysUntilExpiration: 1,
  valid: true,
}));

vi.mock("@/lib/ssl", () => ({
  fetchSslInfo: vi.fn().mockResolvedValue(sslMock),
  fetchSslLabs: vi.fn().mockResolvedValue({ grade: "A" }),
}));

const axeMock = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({ violations: [] }),
}));

vi.mock("axe-core", () => ({ default: axeMock }));

afterEach(() => {
  nock.cleanAll();
});

describe("audit images without alt", () => {
  it("counts images missing alt", async () => {
    const html = `<!doctype html><img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="c">`;
    nock("https://example.com")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://example.com");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{ imagesWithoutAlt: number }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.imagesWithoutAlt).toBe(2);
  });

  it("returns zero when all images have alt", async () => {
    const html = `<!doctype html><img src="a.jpg" alt="a"><img src="b.jpg" alt="b">`;
    nock("https://example.org")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
  const id = await startAudit("https://example.org");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{ imagesWithoutAlt: number }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.imagesWithoutAlt).toBe(0);
  });
});

describe("additional checks", () => {
  it("detects robots.txt and missing security headers", async () => {
    const html = `<!doctype html>`;
    nock("https://example.net")
      .get("/")
      .reply(200, html, { "x-content-type-options": "nosniff" })
      .get("/robots.txt")
      .reply(200, "User-agent: *")
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://example.net");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      robotsTxtPresent: boolean;
      sitemapPresent: boolean;
      missingSecurityHeaders: string[];
      usesHttps: boolean;
      xmlRpcEnabled: boolean;
      userEnumerationEnabled: boolean;
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.robotsTxtPresent).toBe(true);
    expect(data.sitemapPresent).toBe(false);
    expect(data.missingSecurityHeaders).toContain("content-security-policy");
    expect(data.missingSecurityHeaders).toContain("permissions-policy");
    expect(data.usesHttps).toBe(true);
    expect(data.xmlRpcEnabled).toBe(false);
    expect(data.userEnumerationEnabled).toBe(false);
  });

  it("flags misconfigured security headers", async () => {
    const html = `<!doctype html>`;
    nock("https://badheaders.test")
      .get("/")
      .reply(200, html, { "x-frame-options": "allow-from http://evil.com" })
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://badheaders.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      misconfiguredSecurityHeaders: string[];
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.misconfiguredSecurityHeaders).toContain("x-frame-options");
  });
});

describe("ssl info", () => {
  it("includes ssl certificate details", async () => {
    const html = `<!doctype html>`;
    nock("https://ssl.test")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://ssl.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      ssl: typeof sslMock;
      sslLabs: { grade: string } | null;
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.ssl).toEqual(sslMock);
    expect(data.sslLabs).toEqual({ grade: "A" });
  });
});

describe("versions and exposures", () => {
  it("flags outdated plugin and theme versions", async () => {
    vi.mocked(fetchLatestVersion).mockImplementation(async () => "2.0");
    const html =
      `<!doctype html>` +
      `<script src=\"/wp-content/plugins/test-plugin/main.js?ver=1.0\"></script>` +
      `<link rel=\"stylesheet\" href=\"/wp-content/themes/test-theme/style.css?ver=1.0\">`;
    nock("https://version.test")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://version.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      plugins: { slug: string; outdated: boolean }[];
      themes: { slug: string; outdated: boolean }[];
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.plugins[0]).toEqual(
      expect.objectContaining({ slug: "test-plugin", outdated: true })
    );
    expect(data.themes[0]).toEqual(
      expect.objectContaining({ slug: "test-theme", outdated: true })
    );
  });

  it("detects directory listing and exposed backups", async () => {
    vi.mocked(checkDirectoryListing).mockResolvedValueOnce(true);
    vi.mocked(checkWpConfigBackup).mockResolvedValueOnce(true);
    const html = `<!doctype html>`;
    nock("https://exposed.test")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://exposed.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      directoryListing: boolean;
      wpConfigBakExposed: boolean;
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.directoryListing).toBe(true);
    expect(data.wpConfigBakExposed).toBe(true);
  });
});

describe("cookies and mixed content", () => {
  it("reports insecure cookies and mixed resources", async () => {
    const html =
      `<!doctype html><img src=\"http://insecure.test/a.jpg\">`;
    nock("https://cookiemix.test")
      .get("/")
      .reply(200, html, {
        "set-cookie": ["a=1", "b=2; Secure; HttpOnly"],
      })
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://cookiemix.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      cookiesMissingSecure: number;
      cookiesMissingHttpOnly: number;
      mixedContent: string[];
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.cookiesMissingSecure).toBe(1);
    expect(data.cookiesMissingHttpOnly).toBe(1);
    expect(data.mixedContent).toEqual(["http://insecure.test/a.jpg"]);
  });
});

describe("performance metrics", () => {
  it("collects response and asset info", async () => {
    const html =
      `<!doctype html><script src=\"a.js\"></script><script src=\"b.js\"></script>` +
      `<link rel=\"stylesheet\" href=\"a.css\">` +
      `<link rel=\"stylesheet\" href=\"b.css\">` +
      `<link rel=\"stylesheet\" href=\"c.css\">`;
    const body = brotliCompressSync(Buffer.from(html));
    nock("https://perf.test")
      .get("/")
      .reply(200, body, {
        "content-encoding": "br",
        "alt-svc": 'h3=":443"',
        "cache-control": "max-age=60",
        expires: "Tue, 01 Jan 2030 00:00:00 GMT",
      })
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://perf.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      jsAssetCount: number;
      cssAssetCount: number;
      compression: string | null;
      cacheControl: string | null;
      expires: string | null;
      supportsHttp3: boolean;
      ttfb: number | null;
      httpVersion: string;
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.jsAssetCount).toBe(2);
    expect(data.cssAssetCount).toBe(3);
    expect(data.compression).toBe("br");
    expect(data.cacheControl).toBe("max-age=60");
    expect(data.expires).toBe("Tue, 01 Jan 2030 00:00:00 GMT");
    expect(data.supportsHttp3).toBe(true);
    expect(typeof data.ttfb).toBe("number");
    expect(data.httpVersion).toBe("1.1");
  });
});

describe("broken links", () => {
  it("reports links with 4xx/5xx status", async () => {
    const html =
      `<!doctype html><a href=\"/ok\">ok</a><a href=\"/bad\">bad</a>`;
    nock("https://broken.test")
      .get("/")
      .reply(200, html)
      .head("/ok")
      .reply(200)
      .head("/bad")
      .reply(404)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://broken.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{ brokenLinks: string[] }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.brokenLinks).toEqual(["https://broken.test/bad"]);
  });
});

describe("seo checks", () => {
  it("parses canonical, robots, social tags, and structured data", async () => {
    vi.mocked(fetchStructuredData).mockResolvedValueOnce({ items: ["Article"] });
    const html =
      `<!doctype html>` +
      `<link rel="canonical" href="https://social.test/">` +
      `<meta name="robots" content="noindex,nofollow">` +
      `<meta property="og:title" content="OG Title">` +
      `<meta name="twitter:card" content="summary">`;
    nock("https://social.test")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://social.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      canonicalUrl: string | null;
      robotsNoindex: boolean;
      robotsNofollow: boolean;
      openGraph: Record<string, string>;
      twitterCard: Record<string, string>;
      missingOpenGraph: string[];
      missingTwitter: string[];
      structuredData: string[];
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.canonicalUrl).toBe("https://social.test/");
    expect(data.robotsNoindex).toBe(true);
    expect(data.robotsNofollow).toBe(true);
    expect(data.openGraph["og:title"]).toBe("OG Title");
    expect(data.missingOpenGraph).toContain("og:description");
    expect(data.twitterCard["twitter:card"]).toBe("summary");
    expect(data.missingTwitter).toContain("twitter:title");
    expect(data.structuredData).toEqual(["Article"]);
  });

  it("flags multiple h1 tags and broken images", async () => {
    const html =
      `<!doctype html>` +
      `<h1>One</h1><h1>Two</h1>` +
      `<img src="/good.jpg"><img src="/bad.jpg">`;
    nock("https://images.test")
      .get("/")
      .reply(200, html)
      .head("/good.jpg")
      .reply(200)
      .head("/bad.jpg")
      .reply(404)
      .get("/bad.jpg")
      .reply(404)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://images.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      h1Count: number;
      hasMultipleH1: boolean;
      brokenImages: string[];
      brokenImageCount: number;
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.h1Count).toBe(2);
    expect(data.hasMultipleH1).toBe(true);
    expect(data.brokenImageCount).toBe(1);
    expect(data.brokenImages[0]).toBe("https://images.test/bad.jpg");
  });
});

describe("accessibility", () => {
  it("includes axe-core violations in summary", async () => {
    axeMock.run.mockResolvedValueOnce({
      violations: [
        {
          id: "image-alt",
          description: "Images must have alternate text",
        },
      ],
    });
    const html = `<!doctype html><img src="a.jpg">`;
    nock("https://a11y.test")
      .get("/")
      .reply(200, html)
      .get("/robots.txt")
      .reply(404)
      .get("/sitemap.xml")
      .reply(404);
    const id = await startAudit("https://a11y.test");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{
      accessibilityViolationCount: number;
      accessibilityViolations: string[];
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.accessibilityViolationCount).toBe(1);
    expect(data.accessibilityViolations[0]).toContain("image-alt");
  });
});
