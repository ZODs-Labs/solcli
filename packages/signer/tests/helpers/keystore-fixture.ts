import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { pubkeyFromSeedBytes } from "../../src/adapters/file.js";
import { testSecrets } from "./test-crypto.js";

export interface BuiltKeystore {
  readonly filePath: string;
  readonly password: string;
  readonly seed: Uint8Array;
  readonly pubkey: string;
}

/**
 * Build a fresh encrypted keystore in `dir` for use in tests. Uses the
 * `testSecrets` argon2id+AES-256-GCM helper so the file decrypts via the
 * exact same primitive the file adapter receives via `deps.secrets`.
 */
export async function writeKeystoreFile(
  dir: string,
  opts: {
    readonly password: string;
    readonly seed?: Uint8Array;
    readonly fileName?: string;
    readonly label?: string;
    readonly secureMode?: boolean;
  },
): Promise<BuiltKeystore> {
  const seed = opts.seed ?? defaultSeed();
  const expanded = expandTo64(seed);
  const ctrl = new AbortController();
  const encrypted = await testSecrets.encrypt(expanded, opts.password, ctrl.signal);
  const pubkey = pubkeyFromSeedBytes(seed);
  const payload = {
    version: 1,
    kdf: "argon2id",
    cipher: "aes-256-gcm",
    encrypted: Buffer.from(encrypted).toString("base64"),
    pubkey,
    label: opts.label,
  };
  const filePath = path.join(dir, opts.fileName ?? "keystore.json");
  await writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  if (process.platform !== "win32" && opts.secureMode !== false) {
    await chmod(filePath, 0o600);
  }
  expanded.fill(0);
  return { filePath, password: opts.password, seed: new Uint8Array(seed), pubkey };
}

function defaultSeed(): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = (i * 7 + 13) & 0xff;
  return out;
}

function expandTo64(seed: Uint8Array): Uint8Array {
  // Solana keypair shape: seed (32) || pubkey (32). The file adapter
  // accepts either, so we pad the pubkey half with zeros for the test
  // fixture; the adapter extracts the leading 32-byte seed.
  const out = new Uint8Array(64);
  out.set(seed.subarray(0, 32), 0);
  return out;
}
