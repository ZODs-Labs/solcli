import { compileTransaction } from "@solana/kit";
import type { SignableTransactionMessage } from "@solcli/contracts";

/**
 * Return the canonical Solana v0 message wire bytes for a signable
 * transaction message. These are the exact bytes the runtime verifies
 * signatures against.
 */
export function serializeMessage(message: SignableTransactionMessage): Uint8Array {
  const compiled = compileTransaction(message);
  return new Uint8Array(compiled.messageBytes);
}
