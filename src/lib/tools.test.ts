import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import {
  fetchWordPressInfo,
  fetchPageSpeedScores,
  fetchVulnerabilities,
  checkXmlRpc,
  checkUserEnumeration,
  fetchLatestVersion,
  checkDirectoryListing,
  checkWpConfigBackup,
} from "./tools";

const ORIGINAL_API_KEY = process.env.PAGESPEED_API_KEY;
const ORIGINAL_WPSCAN_TOKEN = process.env.WPSCAN_API_TOKEN;
const ORIGINAL_WPVULNDB_TOKEN = process.env.WPVULNDB_API_TOKEN;

beforeEach(() => {
  delete process.env.PAGESPEED_API_KEY;
  delete process.env.WPSCAN_API_TOKEN;
  delete process.env.WPVULNDB_API_TOKEN;
});

afterEach(() => {
  nock.cleanAll();
  process.env.PAGESPEED_API_KEY = ORIGINAL_API_KEY;
  process.env.WPSCAN_API_TOKEN = ORIGINAL_WPSCAN_TOKEN;
  process.env.WPVULNDB_API_TOKEN = ORIGINAL_WPVULNDB_TOKEN;
});

describe("fetchWordPressInfo", () => {
  it("detects WordPress sites", async () => {
    nock("https://example.com")
      .get("/wp-json")
      .reply(200, { name: "Example" })
      .get("/")
      .reply(
        200,
        "<meta name=\"generator\" content=\"WordPress 6.5.2\">",
        { "x-cache-enabled": "true" }
      );
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
      caching: ["WP Rocket"],
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
    expect(info.caching).toEqual([]);
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
    expect(info.caching).toEqual([]);
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
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500 },
          FIRST_INPUT_DELAY_MS: { percentile: 50 },
          EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT: { percentile: 200 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 0.1 },
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
      lcp: 2500,
      fid: 50,
      inp: 200,
      cls: 0.1,
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
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500 },
          FIRST_INPUT_DELAY_MS: { percentile: 50 },
          EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT: { percentile: 200 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 0.1 },
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
      lcp: 2500,
      fid: 50,
      inp: 200,
      cls: 0.1,
    });
  });
});

describe("fetchVulnerabilities", () => {
  it("parses vulnerabilities", async () => {
    process.env.WPSCAN_API_TOKEN = "token123";
    nock("https://wpscan.com")
      .get("/api/v3/plugins/test")
      .matchHeader("Authorization", "Token token=token123")
      .reply(200, {
        vulnerabilities: [
          {
            fixed_in: "1.2.3",
            cvss: { score: 9.1 },
            references: { url: ["https://example.com"] },
          },
        ],
      });
    const res = await fetchVulnerabilities("plugin", ["test"]);
    expect(res).toEqual({
      test: [
        {
          severity: "critical",
          fixedIn: "1.2.3",
          references: ["https://example.com"],
        },
      ],
    });
  });

  it("returns empty without token", async () => {
    const res = await fetchVulnerabilities("plugin", ["test"]);
    expect(res).toEqual({});
  });
});

describe("checkXmlRpc", () => {
  it("detects enabled xmlrpc", async () => {
    nock("https://xmlrpc.test").get("/xmlrpc.php").reply(405, "XML-RPC server accepts POST requests only.");
    const enabled = await checkXmlRpc("https://xmlrpc.test");
    expect(enabled).toBe(true);
  });

  it("returns false when disabled", async () => {
    nock("https://no-xmlrpc.test").get("/xmlrpc.php").reply(404);
    const enabled = await checkXmlRpc("https://no-xmlrpc.test");
    expect(enabled).toBe(false);
  });
});

describe("checkUserEnumeration", () => {
  it("flags when user ids are exposed", async () => {
    nock("https://users.test")
      .get("/wp-json/wp/v2/users")
      .query({ per_page: "1" })
      .reply(200, [{ id: 1, name: "admin" }]);
    const exposed = await checkUserEnumeration("https://users.test");
    expect(exposed).toBe(true);
  });

  it("returns false when blocked", async () => {
    nock("https://no-users.test")
      .get("/wp-json/wp/v2/users")
      .query({ per_page: "1" })
      .reply(401, { code: "rest_cannot_access" });
    const exposed = await checkUserEnumeration("https://no-users.test");
    expect(exposed).toBe(false);
  });
});

describe("fetchLatestVersion", () => {
  it("fetches plugin version", async () => {
    nock("https://api.wordpress.org")
      .get("/plugins/info/1.0/test.json")
      .reply(200, { version: "1.2.3" });
    const ver = await fetchLatestVersion("plugin", "test");
    expect(ver).toBe("1.2.3");
  });

  it("fetches theme version", async () => {
    nock("https://api.wordpress.org")
      .get("/themes/info/1.2/")
      .query({ action: "theme_information", "request[slug]": "theme" })
      .reply(200, { version: "2.0" });
    const ver = await fetchLatestVersion("theme", "theme");
    expect(ver).toBe("2.0");
  });
});

describe("checkDirectoryListing", () => {
  it("detects listing", async () => {
    nock("https://list.test")
      .get("/wp-content/")
      .reply(200, "<title>Index of /wp-content</title>");
    const res = await checkDirectoryListing("https://list.test");
    expect(res).toBe(true);
  });

  it("returns false when disabled", async () => {
    nock("https://nolisting.test").get("/wp-content/").reply(403);
    const res = await checkDirectoryListing("https://nolisting.test");
    expect(res).toBe(false);
  });
});

describe("checkWpConfigBackup", () => {
  it("detects exposed backup", async () => {
    nock("https://backup.test")
      .get("/wp-config.php.bak")
      .reply(200, "DB_NAME='wp'");
    const res = await checkWpConfigBackup("https://backup.test");
    expect(res).toBe(true);
  });

  it("returns false when missing", async () => {
    nock("https://nobackup.test").get("/wp-config.php.bak").reply(404);
    const res = await checkWpConfigBackup("https://nobackup.test");
    expect(res).toBe(false);
  });
});
