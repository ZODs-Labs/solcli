import { describe, expect, it } from "vitest";
import { evaluateIdempotency } from "../src/idempotency.js";

describe("evaluateIdempotency", () => {
  it("passes when key is fresh", () => {
    const seen = new Set<string>();
    const v = evaluateIdempotency("k1", (k) => seen.has(k));
    expect(v.ok).toBe(true);
  });

  it("rejects when key has been seen", () => {
    const seen = new Set<string>(["dup"]);
    const v = evaluateIdempotency("dup", (k) => seen.has(k));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
    expect(v.reason).toContain("dup");
  });
});
