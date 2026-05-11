import { getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { ValidationError } from "@solcli/errors";

const ENCODER = getBase58Encoder();
const DECODER = getBase58Decoder();

/** Encode raw bytes as Bitcoin/Solana base58. */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  return DECODER.decode(bytes);
}

/** Decode a base58 string. Throws `ValidationError` on invalid input. */
export function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array();
  try {
    return new Uint8Array(ENCODER.encode(input));
  } catch (cause) {
    throw new ValidationError(`Invalid base58 string`, {
      details: { input },
      cause: cause instanceof Error ? cause : new Error(String(cause)),
    });
  }
}
