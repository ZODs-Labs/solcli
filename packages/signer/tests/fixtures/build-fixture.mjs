import {
  createCipheriv,
  createPrivateKey,
  randomBytes,
  sign as nodeSign,
} from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argon2id } from "@noble/hashes/argon2.js";

// Builds packages/signer/tests/fixtures/keystore.json so the file adapter
// has a stable example payload to decrypt. Run with:
//   node packages/signer/tests/fixtures/build-fixture.mjs

const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;
const ARGON = { t: 2, m: 16 * 1024, p: 1, dkLen: KEY_LEN };

const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  for (const b of bytes) {
    if (b === 0) zeros += 1;
    else break;
  }
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = "";
  while (num > 0n) {
    const idx = Number(num % 58n);
    num = num / 58n;
    out = ALPHABET.charAt(idx) + out;
  }
  return ALPHABET.charAt(0).repeat(zeros) + out;
}

function pubkeyFromSeed(seed) {
  const der = Buffer.concat([Buffer.from(PKCS8_ED25519_PREFIX), Buffer.from(seed)]);
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const jwk = key.export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url");
}

const PASSWORD = "fixture-password-1234";
const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = (i * 7 + 13) & 0xff;
const PUBKEY = base58Encode(pubkeyFromSeed(SEED));

const expanded = new Uint8Array(64);
expanded.set(SEED, 0);

const salt = randomBytes(SALT_LEN);
const iv = randomBytes(IV_LEN);
const key = argon2id(new TextEncoder().encode(PASSWORD), salt, ARGON);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(expanded)), cipher.final()]);
const tag = cipher.getAuthTag();
key.fill(0);

const opaque = Buffer.concat([salt, iv, tag, ct]);

const out = {
  version: 1,
  kdf: "argon2id",
  cipher: "aes-256-gcm",
  encrypted: opaque.toString("base64"),
  pubkey: PUBKEY,
  label: "fixture keystore",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "keystore.json");
await writeFile(target, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
process.stdout.write(JSON.stringify({ written: target, pubkey: PUBKEY }) + "\n");
