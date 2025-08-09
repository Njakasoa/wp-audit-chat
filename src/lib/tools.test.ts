import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";
import { fetchWordPressInfo, fetchPageSpeedScores } from "./tools";

afterEach(() => {
  nock.cleanAll();
});

describe("fetchWordPressInfo", () => {
  it("detects WordPress sites", async () => {
    nock("https://example.com").get("/wp-json").reply(200, { name: "Example" });
    const info = await fetchWordPressInfo("https://example.com");
    expect(info).toEqual({ isWordPress: true, name: "Example" });
  });

  it("returns false for non-WordPress", async () => {
    nock("https://notwp.com").get("/wp-json").reply(404);
    const info = await fetchWordPressInfo("https://notwp.com");
    expect(info.isWordPress).toBe(false);
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
      .query({ url: "https://example.com" })
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
