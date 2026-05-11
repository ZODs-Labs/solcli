import { describe, expect, it } from "vitest";
import { evaluateCostBudget } from "../src/cost-budget.js";
import { lam, simulation } from "./_fixtures.js";

describe("evaluateCostBudget", () => {
  it("passes when fee plus delta fits in budget", () => {
    const sim = simulation({ feeLamports: lam(5000n) });
    const v = evaluateCostBudget(sim, 100_000n, 10_000n);
    expect(v.ok).toBe(true);
  });

  it("passes exactly at budget boundary", () => {
    const sim = simulation({ feeLamports: lam(5000n) });
    const v = evaluateCostBudget(sim, 15_000n, 10_000n);
    expect(v.ok).toBe(true);
  });

  it("rejects when total exceeds budget", () => {
    const sim = simulation({ feeLamports: lam(5000n) });
    const v = evaluateCostBudget(sim, 10_000n, 10_000n);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_BUDGET_EXCEEDED");
    expect(v.reason).toMatch(/15000/);
  });
});
