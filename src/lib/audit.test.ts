import { afterEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { startAudit, getEmitter } from "./audit";

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
    fetchWordPressInfo: vi.fn().mockResolvedValue({ isWordPress: false }),
    fetchPageSpeedScores: vi.fn().mockResolvedValue({}),
    fetchVulnerabilities: vi.fn().mockResolvedValue({}),
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
}));

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
    }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.robotsTxtPresent).toBe(true);
    expect(data.sitemapPresent).toBe(false);
    expect(data.missingSecurityHeaders).toContain("content-security-policy");
    expect(data.missingSecurityHeaders).toContain("permissions-policy");
    expect(data.usesHttps).toBe(true);
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
    const data = await new Promise<{ ssl: typeof sslMock }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.ssl).toEqual(sslMock);
  });
});
