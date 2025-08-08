import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("adds https scheme", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
  });
});
