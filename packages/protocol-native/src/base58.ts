const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encode a byte array as base58. Used to render 32 byte pubkey slices read
 * from Solana account data into their canonical string form.
 *
 * TODO: replace with the upstream SDK codec once the v1 RPC flow lands.
 */
export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros += 1;
  }
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) + BigInt(b);
  }
  let out = "";
  while (value > 0n) {
    const rem = Number(value % 58n);
    value = value / 58n;
    out = ALPHABET[rem] + out;
  }
  for (let i = 0; i < zeros; i += 1) {
    out = `${ALPHABET[0]}${out}`;
  }
  return out;
}
