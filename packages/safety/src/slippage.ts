import type { SafetyVerdict } from "@solcli/contracts";

export interface SlippageAmounts {
  readonly expected: bigint;
  readonly actual: bigint;
}

export function evaluateSlippage(amounts: SlippageAmounts, maxBps: number): SafetyVerdict {
  const { expected, actual } = amounts;
  if (expected === 0n) {
    if (actual !== 0n) {
      return {
        ok: false,
        code: "SOLCLI_E_SAFETY_BUDGET_EXCEEDED",
        reason: `slippage undefined: expected 0 but actual ${actual}`,
      };
    }
    return { ok: true };
  }
  const diff = actual > expected ? actual - expected : expected - actual;
  const absExpected = expected < 0n ? -expected : expected;
  const bps = (diff * 10000n) / absExpected;
  if (bps > BigInt(maxBps)) {
    return {
      ok: false,
      code: "SOLCLI_E_SAFETY_BUDGET_EXCEEDED",
      reason: `slippage ${bps} bps exceeds max ${maxBps} bps`,
    };
  }
  return { ok: true };
}
