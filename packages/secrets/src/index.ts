import type { Paths, SecretsBackend, SecretsStore } from "@solcli/contracts";
import { EncryptedFileBackend, type EncryptedFileOptions } from "./encrypted-file.js";
import { KeyringBackend } from "./keyring.js";

export interface CreateSecretsOptions {
  paths: Paths;
  forceBackend?: SecretsBackend;
  getMasterPassphrase?: EncryptedFileOptions["getMasterPassphrase"];
}

export function createSecretsStore(opts: CreateSecretsOptions): SecretsStore {
  return new LazySecretsStore(opts);
}

class LazySecretsStore implements SecretsStore {
  private readonly opts: CreateSecretsOptions;
  private resolved: SecretsStore | undefined;

  constructor(opts: CreateSecretsOptions) {
    this.opts = opts;
  }

  backend(): SecretsBackend {
    return this.resolved?.backend() ?? this.opts.forceBackend ?? "encrypted-file";
  }

  async set(name: string, value: string): Promise<void> {
    return this.resolve().set(name, value);
  }

  async get(name: string): Promise<string | null> {
    return this.resolve().get(name);
  }

  async delete(name: string): Promise<void> {
    return this.resolve().delete(name);
  }

  async list(): Promise<string[]> {
    return this.resolve().list();
  }

  private resolve(): SecretsStore {
    this.resolved ??= createConcreteSecretsStore(this.opts);
    return this.resolved;
  }
}

function createConcreteSecretsStore(opts: CreateSecretsOptions): SecretsStore {
  if (opts.forceBackend === "keyring") {
    return new KeyringBackend(opts.paths);
  }
  if (opts.forceBackend === "encrypted-file") {
    const encOpts: EncryptedFileOptions = { paths: opts.paths };
    if (opts.getMasterPassphrase !== undefined) {
      encOpts.getMasterPassphrase = opts.getMasterPassphrase;
    }
    return new EncryptedFileBackend(encOpts);
  }
  if (process.env["CI"] !== "true" && KeyringBackend.probe()) {
    return new KeyringBackend(opts.paths);
  }
  const encOpts: EncryptedFileOptions = { paths: opts.paths };
  if (opts.getMasterPassphrase !== undefined) {
    encOpts.getMasterPassphrase = opts.getMasterPassphrase;
  }
  return new EncryptedFileBackend(encOpts);
}

export { EncryptedFileBackend } from "./encrypted-file.js";
export { KeyringBackend } from "./keyring.js";
