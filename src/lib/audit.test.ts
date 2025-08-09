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

vi.mock("@/lib/tools", () => ({
  fetchWordPressInfo: vi.fn().mockResolvedValue({}),
  fetchPageSpeedScores: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  nock.cleanAll();
});

describe("audit images without alt", () => {
  it("counts images missing alt", async () => {
    const html = `<!doctype html><img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="c">`;
    nock("https://example.com").get("/").reply(200, html);
    const id = await startAudit("https://example.com");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{ imagesWithoutAlt: number }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.imagesWithoutAlt).toBe(2);
  });

  it("returns zero when all images have alt", async () => {
    const html = `<!doctype html><img src="a.jpg" alt="a"><img src="b.jpg" alt="b">`;
    nock("https://example.org").get("/").reply(200, html);
    const id = await startAudit("https://example.org");
    const emitter = getEmitter(id)!;
    const data = await new Promise<{ imagesWithoutAlt: number }>((resolve) => {
      emitter.on("done", resolve);
    });
    expect(data.imagesWithoutAlt).toBe(0);
  });
});
