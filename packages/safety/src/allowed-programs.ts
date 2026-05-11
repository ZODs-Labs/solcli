import type { SafetyVerdict, SignableTransactionMessage } from "@solcli/contracts";

export function evaluateAllowedPrograms(
  message: SignableTransactionMessage,
  allowed: ReadonlySet<string>,
): SafetyVerdict {
  for (const ix of message.instructions) {
    if (!allowed.has(ix.programAddress)) {
      return {
        ok: false,
        code: "SOLCLI_E_SAFETY_PROGRAM_DENIED",
        reason: `program not in allowlist: ${ix.programAddress}`,
      };
    }
  }
  return { ok: true };
}
