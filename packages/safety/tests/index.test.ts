import type { EventRecord, SafetyEvaluateOptions } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { createSafetyEvaluator } from "../src/index.js";
import { lam, plan, simulation } from "./_fixtures.js";

function baseOpts(over: Partial<SafetyEvaluateOptions> = {}): SafetyEvaluateOptions {
  return {
    execute: over.execute ?? true,
    idempotencyKey: over.idempotencyKey ?? "fresh",
    costBudgetLamports: over.costBudgetLamports ?? 1_000_000n,
    allowedPrograms: over.allowedPrograms ?? ["prog1"],
    ...(over.maxSlippageBps !== undefined ? { maxSlippageBps: over.maxSlippageBps } : {}),
  };
}

describe("createSafetyEvaluator.evaluateBuild", () => {
  it("returns ok when all build-time gates pass", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateBuild(plan(), baseOpts());
    expect(v.ok).toBe(true);
  });

  it("rejects with INTENT_REQUIRED when execute is false", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateBuild(plan(), baseOpts({ execute: false }));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
  });

  it("rejects on duplicate idempotency key", () => {
    const ev = createSafetyEvaluator({ seenIdempotencyKeys: new Set(["dup"]) });
    const v = ev.evaluateBuild(plan(), baseOpts({ idempotencyKey: "dup" }));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
  });

  it("rejects on a denied program", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateBuild(plan(), baseOpts({ allowedPrograms: ["other"] }));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_PROGRAM_DENIED");
  });
});

describe("createSafetyEvaluator.evaluateSimulation", () => {
  it("returns ok when budget fits and programs allowed", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateSimulation(plan(), simulation(), baseOpts());
    expect(v.ok).toBe(true);
  });

  it("rejects when outflow plus fee exceeds budget", () => {
    const ev = createSafetyEvaluator();
    const sim = simulation({
      feeLamports: lam(5000n),
      accountsDelta: [{ pubkey: "x", lamportsBefore: 1_000_000n, lamportsAfter: 0n }],
    });
    const v = ev.evaluateSimulation(plan(), sim, baseOpts({ costBudgetLamports: 500_000n }));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_BUDGET_EXCEEDED");
  });

  it("rejects when a program is not allowed", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateSimulation(plan(), simulation(), baseOpts({ allowedPrograms: ["nope"] }));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_PROGRAM_DENIED");
  });
});

describe("createSafetyEvaluator.summarizeIntent", () => {
  it("derives signerAlias from plan.tags when present", () => {
    const ev = createSafetyEvaluator();
    const tp = plan({ tags: { signerAlias: "alice" } });
    const env = ev.summarizeIntent(tp, simulation(), baseOpts());
    expect(env.signerAlias).toBe("alice");
  });

  it("falls back to empty string when no tag is set", () => {
    const ev = createSafetyEvaluator();
    const env = ev.summarizeIntent(plan(), simulation(), baseOpts());
    expect(env.signerAlias).toBe("");
  });
});

describe("createSafetyEvaluator emit", () => {
  it("emits safety.gate.passed for each passing gate when emit is wired", () => {
    const records: EventRecord[] = [];
    const ev = createSafetyEvaluator({
      emit: (r) => records.push(r),
      clock: () => 0,
      requestId: "rid",
    });
    ev.evaluateBuild(plan(), baseOpts());
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.kind === "safety.gate.passed")).toBe(true);
    expect(records.every((r) => r.requestId === "rid")).toBe(true);
  });

  it("emits safety.gate.rejected for a failing gate", () => {
    const records: EventRecord[] = [];
    const ev = createSafetyEvaluator({
      emit: (r) => records.push(r),
      clock: () => 0,
      requestId: "rid",
    });
    ev.evaluateBuild(plan(), baseOpts({ execute: false }));
    const rejected = records.find((r) => r.kind === "safety.gate.rejected");
    expect(rejected).toBeDefined();
  });

  it("is a no-op for emit when deps.emit is not supplied", () => {
    const ev = createSafetyEvaluator();
    const v = ev.evaluateBuild(plan(), baseOpts());
    expect(v.ok).toBe(true);
  });
});
