import { readFile, stat } from "node:fs/promises";
import type {
  Pubkey,
  SignedTransaction,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignTransactionOptions,
  TransactionPlan,
} from "@solcli/contracts";
import {
  InternalError,
  NonInteractiveError,
  SignerNotAvailableError,
  SignerPermissionsInsecureError,
  ValidationError,
} from "@solcli/errors";
import { base58Encode } from "../base58.js";
import { ed25519PubkeyFromSeed, extractSeed } from "../ed25519.js";
import type { SignerAdapter, SignerAdapterKind, SignerInitDeps } from "../port.js";
import { signWithKeyBytes } from "./common.js";

const KIND: SignerAdapterKind = "file";

interface KeystoreFile {
  readonly version: 1;
  readonly kdf: "argon2id";
  readonly cipher: "aes-256-gcm";
  /** Opaque base64 blob produced by `SecretsCrypto.encrypt`. */
  readonly encrypted: string;
  /** Optional cached public key in base58 so `read` works without decryption. */
  readonly pubkey?: string;
  /** Optional human label for the alias. */
  readonly label?: string;
}

export class FileSignerAdapter implements SignerAdapter {
  readonly kind = KIND;
  private deps: SignerInitDeps | undefined;

  async init(deps: SignerInitDeps): Promise<void> {
    if (deps.options.filePath === undefined || deps.options.filePath.length === 0) {
      throw new ValidationError("File signer requires options.filePath");
    }
    this.deps = deps;
  }

  async dispose(): Promise<void> {
    this.deps = undefined;
  }

  async sign(
    alias: SignerAlias,
    plan: TransactionPlan,
    opts: SignTransactionOptions,
  ): Promise<SignedTransaction> {
    const deps = this.requireDeps();
    opts.signal.throwIfAborted();
    const filePath = this.requireFilePath(deps);

    await assertSecureMode(filePath);

    const keystore = await readKeystore(filePath);
    const password = resolvePassword(deps);

    opts.signal.throwIfAborted();
    const cipherBytes = base64Decode(keystore.encrypted);
    const plain = await deps.secrets.decrypt(cipherBytes, password, opts.signal);

    return signWithKeyBytes({
      alias,
      adapter: KIND,
      plan,
      opts,
      deps,
      keyBytes: plain,
    });
  }

  async read(alias: SignerAlias, opts: SignerInfoOptions): Promise<SignerInfo> {
    const deps = this.requireDeps();
    opts.signal.throwIfAborted();
    const filePath = this.requireFilePath(deps);
    const keystore = await readKeystore(filePath).catch(() => undefined);
    const info: { -readonly [K in keyof SignerInfo]: SignerInfo[K] } = {
      alias,
      adapter: KIND,
    };
    if (keystore?.pubkey !== undefined && keystore.pubkey.length > 0) {
      info.pubkey = keystore.pubkey as unknown as Pubkey;
    }
    const label = keystore?.label ?? deps.options.label;
    if (label !== undefined) info.label = label;
    return info;
  }

  async list(opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    const deps = this.requireDeps();
    return [await this.read(deps.alias, opts)];
  }

  private requireDeps(): SignerInitDeps {
    if (this.deps === undefined) {
      throw new InternalError("FileSignerAdapter used before init()");
    }
    return this.deps;
  }

  private requireFilePath(deps: SignerInitDeps): string {
    const fp = deps.options.filePath;
    if (fp === undefined || fp.length === 0) {
      throw new ValidationError("File signer requires options.filePath");
    }
    return fp;
  }
}

export function createFileSignerAdapter(): FileSignerAdapter {
  return new FileSignerAdapter();
}

async function assertSecureMode(filePath: string): Promise<void> {
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SignerNotAvailableError(`Keystore file not found: ${filePath}`, {
        details: { filePath },
      });
    }
    throw new SignerNotAvailableError(`Cannot stat keystore file: ${filePath}`, {
      details: { filePath },
    });
  }
  if (process.platform === "win32") return;
  if ((s.mode & 0o077) !== 0) {
    throw new SignerPermissionsInsecureError(
      `keystore file ${filePath} is group/other-readable; mode 0o600 required`,
      { details: { filePath, mode: (s.mode & 0o777).toString(8) } },
    );
  }
}

async function readKeystore(filePath: string): Promise<KeystoreFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    throw new SignerNotAvailableError(`Cannot read keystore file: ${filePath}`, {
      details: { filePath, err: errMessage(err) },
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new ValidationError(`Malformed keystore JSON at ${filePath}`, {
      details: { filePath, err: errMessage(err) },
    });
  }
  if (!isKeystoreFile(parsed)) {
    throw new ValidationError(`Keystore file ${filePath} has invalid shape`, {
      details: { filePath },
    });
  }
  return parsed;
}

function isKeystoreFile(v: unknown): v is KeystoreFile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o["version"] === 1 &&
    o["kdf"] === "argon2id" &&
    o["cipher"] === "aes-256-gcm" &&
    typeof o["encrypted"] === "string" &&
    (o["pubkey"] === undefined || typeof o["pubkey"] === "string") &&
    (o["label"] === undefined || typeof o["label"] === "string")
  );
}

function resolvePassword(deps: SignerInitDeps): string {
  const fromEnv = deps.env["SOLCLI_KEYSTORE_PASSWORD"];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  throw new NonInteractiveError(
    "Keystore password not available; set SOLCLI_KEYSTORE_PASSWORD or pass --keystore-password-file in interactive mode",
    { details: { envVar: "SOLCLI_KEYSTORE_PASSWORD" } },
  );
}

function base64Decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Compute the cached pubkey for a freshly-built keystore. Exported for
 * fixture builders.
 */
export async function pubkeyFromSeedBytes(seed: Uint8Array): Promise<string> {
  return base58Encode(await ed25519PubkeyFromSeed(extractSeed(seed)));
}
