import type { SafetyVerdict } from "@solcli/contracts";

export function evaluateSimulateFirst(opts: { readonly execute: boolean }): SafetyVerdict {
  if (opts.execute !== true) {
    return {
      ok: false,
      code: "SOLCLI_E_SAFETY_INTENT_REQUIRED",
      reason: "simulate-first default; pass --execute to proceed",
    };
  }
  return { ok: true };
}
