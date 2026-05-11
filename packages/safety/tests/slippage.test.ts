import { describe, expect, it } from "vitest";
import { evaluateSlippage } from "../src/slippage.js";

describe("evaluateSlippage", () => {
  it("passes when actual matches expected", () => {
    const v = evaluateSlippage({ expected: 1_000_000n, actual: 1_000_000n }, 50);
    expect(v.ok).toBe(true);
  });

  it("passes when deviation is within the cap", () => {
    const v = evaluateSlippage({ expected: 1_000_000n, actual: 995_000n }, 100);
    expect(v.ok).toBe(true);
  });

  it("rejects when deviation exceeds the cap", () => {
    const v = evaluateSlippage({ expected: 1_000_000n, actual: 980_000n }, 100);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_BUDGET_EXCEEDED");
    expect(v.reason).toMatch(/bps/);
  });

  it("treats expected 0 with actual 0 as ok", () => {
    const v = evaluateSlippage({ expected: 0n, actual: 0n }, 50);
    expect(v.ok).toBe(true);
  });

  it("rejects expected 0 with nonzero actual", () => {
    const v = evaluateSlippage({ expected: 0n, actual: 1n }, 50);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_BUDGET_EXCEEDED");
    expect(v.reason).toMatch(/undefined/);
  });
});
