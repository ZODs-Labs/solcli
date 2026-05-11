import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  sign as nodeSign,
  randomBytes,
} from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";
import type { SecretsCrypto } from "../../src/port.js";

const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;
const TAG_LEN = 16;
const ARGON = { t: 2, m: 16 * 1024, p: 1, dkLen: KEY_LEN } as const;

/**
 * Concrete `SecretsCrypto` for tests. Uses argon2id + AES-256-GCM with
 * lower-cost argon parameters so the test suite stays fast.
 *
 * Output layout: `salt(16) || iv(12) || tag(16) || ciphertext(...)`.
 */
export const testSecrets: SecretsCrypto = {
  async encrypt(plain, password, signal) {
    signal.throwIfAborted();
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = argon2id(new TextEncoder().encode(password), salt, ARGON);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);
    const tag = cipher.getAuthTag();
    key.fill(0);
    return new Uint8Array(Buffer.concat([salt, iv, tag, enc]));
  },
  async decrypt(cipher, password, signal) {
    signal.throwIfAborted();
    if (cipher.length < SALT_LEN + IV_LEN + TAG_LEN + 1) {
      throw new Error("ciphertext too short");
    }
    const buf = Buffer.from(cipher);
    const salt = buf.subarray(0, SALT_LEN);
    const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
    const key = argon2id(new TextEncoder().encode(password), salt, ARGON);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    key.fill(0);
    return new Uint8Array(out);
  },
};

const PKCS8_ED25519_HEADER = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

export function makeKeyObject(seed: Uint8Array) {
  if (seed.length !== 32) throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  const der = Buffer.concat([PKCS8_ED25519_HEADER, Buffer.from(seed)]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/** Returns the ed25519 public key for the given 32-byte seed. */
export function pubkeyFromSeed(seed: Uint8Array): Uint8Array {
  const key = makeKeyObject(seed);
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("missing JWK x");
  return new Uint8Array(Buffer.from(jwk.x, "base64url"));
}

/** Ed25519 sign over `message` with the 32-byte seed. */
export function signWithSeed(seed: Uint8Array, message: Uint8Array): Uint8Array {
  const key = makeKeyObject(seed);
  return new Uint8Array(nodeSign(null, Buffer.from(message), key));
}
