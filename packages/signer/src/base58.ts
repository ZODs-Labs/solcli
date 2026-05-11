import { ValidationError } from "@solcli/errors";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const INDEX = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  const ch = ALPHABET.charAt(i);
  INDEX.set(ch, i);
}

const ZERO_CHAR = ALPHABET.charAt(0);

/** Encode raw bytes as Bitcoin/Solana base58. */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros += 1;
    else break;
  }
  let num = 0n;
  for (const b of bytes) {
    num = (num << 8n) | BigInt(b);
  }
  let out = "";
  while (num > 0n) {
    const idx = Number(num % 58n);
    num = num / 58n;
    out = (ALPHABET.charAt(idx) ?? "") + out;
  }
  return ZERO_CHAR.repeat(leadingZeros) + out;
}

/** Decode a base58 string. Throws `ValidationError` on invalid input. */
export function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array();
  let leadingZeros = 0;
  for (const ch of input) {
    if (ch === ZERO_CHAR) leadingZeros += 1;
    else break;
  }
  let num = 0n;
  for (const ch of input) {
    const v = INDEX.get(ch);
    if (v === undefined) {
      throw new ValidationError(`Invalid base58 character: ${JSON.stringify(ch)}`, {
        details: { input },
      });
    }
    num = num * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === undefined) continue;
    out[leadingZeros + i] = b;
  }
  return out;
}
