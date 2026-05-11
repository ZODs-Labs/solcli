import { describe, expect, it } from "vitest";
import { evaluateSimulateFirst } from "../src/simulate-first.js";

describe("evaluateSimulateFirst", () => {
  it("passes when execute is true", () => {
    const v = evaluateSimulateFirst({ execute: true });
    expect(v.ok).toBe(true);
  });

  it("rejects when execute is false", () => {
    const v = evaluateSimulateFirst({ execute: false });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
    expect(v.reason).toMatch(/simulate-first/);
  });
});
