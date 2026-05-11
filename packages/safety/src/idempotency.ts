import type { SafetyVerdict } from "@solcli/contracts";

export type HasIdempotencyKey = (key: string) => boolean;

export function evaluateIdempotency(key: string, has: HasIdempotencyKey): SafetyVerdict {
  if (has(key)) {
    return {
      ok: false,
      code: "SOLCLI_E_SAFETY_INTENT_REQUIRED",
      reason: `duplicate idempotency key: ${key}`,
    };
  }
  return { ok: true };
}
