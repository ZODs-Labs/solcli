import {
  type CipherGCM,
  createCipheriv,
  createDecipheriv,
  type DecipherGCM,
  randomBytes,
} from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { argon2id } from "@noble/hashes/argon2.js";
import type { Paths, SecretsBackend, SecretsStore } from "@solcli/contracts";
import { IoError, SecretError } from "@solcli/errors";
import lockfile from "proper-lockfile";

const SECRETS_FILENAME = "secrets.enc.ndjson";
const SALT_FILENAME = "secrets.salt";
const SALT_BYTES = 32;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ARGON2 = { t: 3, m: 64 * 1024, p: 4, dkLen: KEY_BYTES } as const;

interface Entry {
  name: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface EncryptedFileOptions {
  paths: Paths;
  getMasterPassphrase?: () => Promise<string>;
}

export class EncryptedFileBackend implements SecretsStore {
  private readonly secretsPath: string;
  private readonly saltPath: string;
  private readonly getMasterPassphrase: () => Promise<string>;
  private cachedKey: Uint8Array | null = null;

  constructor(opts: EncryptedFileOptions) {
    this.secretsPath = path.join(opts.paths.data, SECRETS_FILENAME);
    this.saltPath = path.join(opts.paths.data, SALT_FILENAME);
    this.getMasterPassphrase =
      opts.getMasterPassphrase ??
      (async () => {
        const v = process.env["SOLCLI_MASTER_KEY"];
        if (!v) {
          throw new SecretError(
            "Encrypted-file secrets backend requires SOLCLI_MASTER_KEY env var (or a keyring-capable platform)",
          );
        }
        return v;
      });
  }

  backend(): SecretsBackend {
    return "encrypted-file";
  }

  private async ensureKey(): Promise<Uint8Array> {
    if (this.cachedKey) return this.cachedKey;
    const passphrase = await this.getMasterPassphrase();
    const salt = await this.ensureSalt();
    const key = argon2id(new TextEncoder().encode(passphrase), salt, {
      t: ARGON2.t,
      m: ARGON2.m,
      p: ARGON2.p,
      dkLen: ARGON2.dkLen,
    });
    this.cachedKey = key;
    return key;
  }

  private async ensureSalt(): Promise<Uint8Array> {
    try {
      const raw = await readFile(this.saltPath);
      if (raw.length !== SALT_BYTES) {
        throw new SecretError(`Salt file at ${this.saltPath} has wrong length`);
      }
      return new Uint8Array(raw);
    } catch (err: unknown) {
      if (err instanceof SecretError) throw err;
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new IoError(`Cannot read salt at ${this.saltPath}`, { cause: err as Error });
      }
    }
    const salt = randomBytes(SALT_BYTES);
    await mkdir(path.dirname(this.saltPath), { recursive: true });
    const tmp = `${this.saltPath}.tmp.${process.pid}`;
    await writeFile(tmp, salt, { mode: 0o600 });
    await rename(tmp, this.saltPath);
    if (process.platform !== "win32") {
      await chmod(this.saltPath, 0o600).catch(() => {
        // best effort
      });
    }
    return new Uint8Array(salt);
  }

  private async readAll(): Promise<Entry[]> {
    let raw: string;
    try {
      raw = await readFile(this.secretsPath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new IoError(`Cannot read ${this.secretsPath}`, { cause: err as Error });
    }
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    const out: Entry[] = [];
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof (parsed as Record<string, unknown>)["name"] === "string" &&
          typeof (parsed as Record<string, unknown>)["iv"] === "string" &&
          typeof (parsed as Record<string, unknown>)["ciphertext"] === "string" &&
          typeof (parsed as Record<string, unknown>)["tag"] === "string"
        ) {
          out.push(parsed as Entry);
        }
      } catch {
        // skip malformed lines
      }
    }
    return out;
  }

  private async writeAll(entries: Entry[]): Promise<void> {
    await mkdir(path.dirname(this.secretsPath), { recursive: true });
    try {
      await readFile(this.secretsPath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await writeFile(this.secretsPath, "", { mode: 0o600 });
      }
    }
    const release = await lockfile.lock(this.secretsPath, {
      retries: { retries: 5, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
      stale: 5_000,
    });
    try {
      const body = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
      const tmp = `${this.secretsPath}.tmp.${process.pid}`;
      await writeFile(tmp, body, { mode: 0o600 });
      await rename(tmp, this.secretsPath);
      if (process.platform !== "win32") {
        await chmod(this.secretsPath, 0o600).catch(() => {
          // best effort
        });
      }
    } finally {
      await release();
    }
  }

  async set(name: string, value: string): Promise<void> {
    if (!name) throw new SecretError("Secret name must be non-empty");
    const key = await this.ensureKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv) as CipherGCM;
    const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.length !== TAG_BYTES) {
      throw new SecretError(`Unexpected auth tag length ${tag.length}`);
    }
    const entry: Entry = {
      name,
      iv: iv.toString("base64"),
      ciphertext: enc.toString("base64"),
      tag: tag.toString("base64"),
    };
    const all = (await this.readAll()).filter((e) => e.name !== name);
    all.push(entry);
    await this.writeAll(all);
  }

  async get(name: string): Promise<string | null> {
    const all = await this.readAll();
    const entry = all.find((e) => e.name === name);
    if (!entry) return null;
    const key = await this.ensureKey();
    const iv = Buffer.from(entry.iv, "base64");
    const ciphertext = Buffer.from(entry.ciphertext, "base64");
    const tag = Buffer.from(entry.tag, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv) as DecipherGCM;
    decipher.setAuthTag(tag);
    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString("utf8");
    } catch (err: unknown) {
      throw new SecretError(
        `Failed to decrypt secret '${name}' (auth tag mismatch - file tampered or wrong master key)`,
        { cause: err as Error },
      );
    }
  }

  async delete(name: string): Promise<void> {
    const all = (await this.readAll()).filter((e) => e.name !== name);
    await this.writeAll(all);
  }

  async list(): Promise<string[]> {
    return (await this.readAll()).map((e) => e.name).sort();
  }
}
