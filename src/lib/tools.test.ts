import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { fetchWordPressInfo, fetchPageSpeedScores } from "./tools";

const ORIGINAL_API_KEY = process.env.PAGESPEED_API_KEY;

beforeEach(() => {
  delete process.env.PAGESPEED_API_KEY;
});

afterEach(() => {
  nock.cleanAll();
  process.env.PAGESPEED_API_KEY = ORIGINAL_API_KEY;
});

describe("fetchWordPressInfo", () => {
  it("detects WordPress sites", async () => {
    nock("https://example.com")
      .get("/wp-json")
      .reply(200, { name: "Example" })
      .get("/")
      .reply(200, "<meta name=\"generator\" content=\"WordPress 6.5.2\">");
    nock("https://api.wordpress.org")
      .get("/core/stable-check/1.0/")
      .query({ version: "6.5.2" })
      .reply(200, { "6.5.2": "latest" });
    const info = await fetchWordPressInfo("https://example.com");
    expect(info).toEqual({
      isWordPress: true,
      name: "Example",
      wpVersion: "6.5.2",
      isUpToDate: true,
    });
  });

  it("returns false for non-WordPress", async () => {
    nock("https://notwp.com")
      .get("/wp-json")
      .reply(404)
      .get("/")
      .reply(200, "<html></html>");
    const info = await fetchWordPressInfo("https://notwp.com");
    expect(info.isWordPress).toBe(false);
    expect(info.wpVersion).toBeUndefined();
  });

  it("flags outdated WordPress versions", async () => {
    nock("https://oldwp.com")
      .get("/wp-json")
      .reply(200, { name: "Old" })
      .get("/")
      .reply(200, "<meta name=\"generator\" content=\"WordPress 5.0\">");
    nock("https://api.wordpress.org")
      .get("/core/stable-check/1.0/")
      .query({ version: "5.0" })
      .reply(200, { "5.0": "insecure" });
    const info = await fetchWordPressInfo("https://oldwp.com");
    expect(info.isWordPress).toBe(true);
    expect(info.isUpToDate).toBe(false);
  });
});

describe("fetchPageSpeedScores", () => {
  it("parses scores", async () => {
    const sample = {
      lighthouseResult: {
        categories: {
          performance: { score: 0.1 },
          accessibility: { score: 0.2 },
          "best-practices": { score: 0.3 },
          seo: { score: 0.4 },
        },
      },
    };
    nock("https://www.googleapis.com")
      .get("/pagespeedonline/v5/runPagespeed")
      .query({
        url: "https://example.com",
        category: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      })
      .reply(200, sample);
    const scores = await fetchPageSpeedScores("https://example.com");
    expect(scores).toEqual({
      performance: 0.1,
      accessibility: 0.2,
      bestPractices: 0.3,
      seo: 0.4,
    });
  });

  it("includes API key when set", async () => {
    const sample = {
      lighthouseResult: {
        categories: {
          performance: { score: 0.1 },
          accessibility: { score: 0.2 },
          "best-practices": { score: 0.3 },
          seo: { score: 0.4 },
        },
      },
    };
    process.env.PAGESPEED_API_KEY = "test123";
    nock("https://www.googleapis.com")
      .get("/pagespeedonline/v5/runPagespeed")
      .query({
        url: "https://example.com",
        category: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
        key: "test123",
      })
      .reply(200, sample);
    const scores = await fetchPageSpeedScores("https://example.com");
    expect(scores).toEqual({
      performance: 0.1,
      accessibility: 0.2,
      bestPractices: 0.3,
      seo: 0.4,
    });
  });
});
