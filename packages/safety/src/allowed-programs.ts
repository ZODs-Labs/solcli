import type { SafetyVerdict, TransactionPlan } from "@solcli/contracts";

export function evaluateAllowedPrograms(
  plan: TransactionPlan,
  allowed: ReadonlySet<string>,
): SafetyVerdict {
  for (const ix of plan.instructions) {
    if (!allowed.has(ix.programId)) {
      return {
        ok: false,
        code: "SOLCLI_E_SAFETY_PROGRAM_DENIED",
        reason: `program not in allowlist: ${ix.programId}`,
      };
    }
  }
  return { ok: true };
}
