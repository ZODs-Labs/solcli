const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const INDEX: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i += 1) {
    const ch = ALPHABET[i];
    if (ch !== undefined) map.set(ch, i);
  }
  return map;
})();

/**
 * Encode a byte array as base58.
 *
 * TODO: replace with the upstream SDK codec once the v1 RPC flow lands. The
 * native protocol package ships its own copy; both converge once @solcli/solana-stubs
 * exports a shared helper.
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

/**
 * Decode a base58 string into bytes. Throws if a non-base58 char is present.
 *
 * Used by ATA derivation to convert base58 pubkeys back into the 32 byte
 * representation that the PDA hash function consumes.
 */
export function decodeBase58(text: string): Uint8Array {
  if (text.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < text.length && text[zeros] === ALPHABET[0]) {
    zeros += 1;
  }
  let value = 0n;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === undefined) throw new Error("decodeBase58: unexpected undefined char");
    const digit = INDEX.get(ch);
    if (digit === undefined) {
      throw new Error(`decodeBase58: invalid character '${ch}' at index ${i}`);
    }
    value = value * 58n + BigInt(digit);
  }
  const tail: number[] = [];
  while (value > 0n) {
    tail.push(Number(value & 0xffn));
    value >>= 8n;
  }
  const out = new Uint8Array(zeros + tail.length);
  for (let i = 0; i < tail.length; i += 1) {
    const byte = tail[tail.length - 1 - i];
    if (byte === undefined) throw new Error("decodeBase58: tail index out of range");
    out[zeros + i] = byte;
  }
  return out;
}
