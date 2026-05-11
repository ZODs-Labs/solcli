import type { SafetyVerdict, SimulationResult } from "@solcli/contracts";

export function evaluateCostBudget(
  simulation: SimulationResult,
  budget: bigint,
  lamportsDelta: bigint,
): SafetyVerdict {
  const total = simulation.feeLamports + lamportsDelta;
  if (total > budget) {
    return {
      ok: false,
      code: "SOLCLI_E_SAFETY_BUDGET_EXCEEDED",
      reason: `estimated cost ${total} exceeds budget ${budget}`,
    };
  }
  return { ok: true };
}
