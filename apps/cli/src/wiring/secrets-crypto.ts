import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";
import type { SecretsCrypto } from "@solcli/signer";

const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;
const TAG_LEN = 16;

/**
 * Production argon2id parameters for keystore decryption. These are slower
 * than the test-fixture parameters by an order of magnitude and produce a
 * derivation cost in the hundreds of milliseconds on a 2024-era laptop.
 *
 * t (iterations), m (memory in KiB), p (parallelism). The tuple here is
 * the same set OWASP recommends as a 2024 baseline for argon2id.
 */
const ARGON = { t: 3, m: 64 * 1024, p: 4, dkLen: KEY_LEN } as const;

/**
 * Production `SecretsCrypto` used by the file signer adapter to decrypt the
 * encrypted keystore. AES-256-GCM with argon2id-derived key. Output layout:
 *   salt(16) || iv(12) || tag(16) || ciphertext(...)
 */
export function createSecretsCrypto(): SecretsCrypto {
  return {
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
        throw new Error("keystore ciphertext too short");
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
}
