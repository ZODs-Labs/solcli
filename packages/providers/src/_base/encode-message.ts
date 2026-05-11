import {
  type Base64EncodedWireTransaction,
  compileTransaction,
  getBase64Decoder,
  getTransactionEncoder,
} from "@solana/kit";
import type { SignableTransactionMessage } from "@solcli/contracts";

const ENCODER = getTransactionEncoder();
const BASE64 = getBase64Decoder();

/**
 * Encode a `SignableTransactionMessage` as the Base64-wire-transaction string
 * Kit's RPC methods (`sendTransaction`, `simulateTransaction`) expect. The
 * transaction is compiled with empty signature slots; callers that want a
 * signed transaction on the wire must sign before calling this.
 */
export function encodeMessageAsBase64Wire(
  message: SignableTransactionMessage,
): Base64EncodedWireTransaction {
  const compiled = compileTransaction(message);
  const bytes = ENCODER.encode(compiled);
  return BASE64.decode(bytes) as Base64EncodedWireTransaction;
}
