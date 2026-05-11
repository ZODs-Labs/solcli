import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Entry } from "@napi-rs/keyring";
import type { Paths, SecretsBackend, SecretsStore } from "@solcli/contracts";
import { SecretError } from "@solcli/errors";

const SERVICE = "solcli";
const PROBE_NAME = "__solcli_probe__";
const INDEX_FILENAME = "secret-index.json";

async function readIndex(indexPath: string): Promise<string[]> {
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string");
    }
    return [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeIndex(indexPath: string, names: string[]): Promise<void> {
  await mkdir(path.dirname(indexPath), { recursive: true });
  const tmp = `${indexPath}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify([...new Set(names)].sort()), { mode: 0o600 });
  await rename(tmp, indexPath);
}

export class KeyringBackend implements SecretsStore {
  private readonly indexPath: string;

  constructor(paths: Paths) {
    this.indexPath = path.join(paths.data, INDEX_FILENAME);
  }

  backend(): SecretsBackend {
    return "keyring";
  }

  async set(name: string, value: string): Promise<void> {
    try {
      new Entry(SERVICE, name).setPassword(value);
    } catch (err: unknown) {
      throw new SecretError(`Failed to write secret '${name}' to keyring`, {
        cause: err as Error,
      });
    }
    const names = await readIndex(this.indexPath);
    if (!names.includes(name)) {
      names.push(name);
      await writeIndex(this.indexPath, names);
    }
  }

  async get(name: string): Promise<string | null> {
    try {
      const value = new Entry(SERVICE, name).getPassword();
      return value ?? null;
    } catch (err: unknown) {
      const msg = ((err as Error).message ?? "").toLowerCase();
      if (msg.includes("no entry") || msg.includes("not found")) {
        return null;
      }
      throw new SecretError(`Failed to read secret '${name}' from keyring`, {
        cause: err as Error,
      });
    }
  }

  async delete(name: string): Promise<void> {
    try {
      new Entry(SERVICE, name).deletePassword();
    } catch (err: unknown) {
      const msg = ((err as Error).message ?? "").toLowerCase();
      if (!msg.includes("no entry") && !msg.includes("not found")) {
        throw new SecretError(`Failed to delete secret '${name}' from keyring`, {
          cause: err as Error,
        });
      }
    }
    const names = (await readIndex(this.indexPath)).filter((n) => n !== name);
    await writeIndex(this.indexPath, names);
  }

  async list(): Promise<string[]> {
    return readIndex(this.indexPath);
  }

  static probe(): boolean {
    try {
      const entry = new Entry(SERVICE, PROBE_NAME);
      entry.setPassword("probe");
      const v = entry.getPassword();
      entry.deletePassword();
      return v === "probe";
    } catch {
      return false;
    }
  }
}
