import { describe, expect, it } from "vitest";
import { auditRequestSchema } from "./validators";

describe("auditRequestSchema", () => {
  it("accepts valid URLs", () => {
    const result = auditRequestSchema.safeParse({ url: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URLs", () => {
    const result = auditRequestSchema.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
