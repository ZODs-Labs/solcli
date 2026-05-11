import type {
  EmitEventPort,
  SignableTransactionMessage,
  SignedTransaction,
  SignerAdapter as SignerAdapterKind,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerInfoPort,
  SignTransactionOptions,
  SignTransactionPort,
} from "@solcli/contracts";

export type {
  SignableTransactionMessage,
  SignedTransaction,
  SignerAdapterKind,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerInfoPort,
  SignTransactionOptions,
  SignTransactionPort,
};

/**
 * Symmetric crypto primitives consumed by adapters that need to decrypt a
 * keystore. The signer package does not bind to a specific crypto
 * implementation; the wiring layer injects one. Tests inject a small
 * argon2id + AES-256-GCM helper.
 */
export interface SecretsCrypto {
  encrypt(plain: Uint8Array, password: string, signal: AbortSignal): Promise<Uint8Array>;
  decrypt(cipher: Uint8Array, password: string, signal: AbortSignal): Promise<Uint8Array>;
}

/**
 * Keychain abstraction the keychain adapter talks to. Production wiring
 * implements this via `@solcli/secrets` (which wraps `@napi-rs/keyring`).
 * Tests inject a `MemoryBackend` to avoid touching the OS keychain.
 */
export interface KeychainBackend {
  /** Returns the raw bytes stored under `name`, or `null` if absent. */
  get(name: string, signal: AbortSignal): Promise<Uint8Array | null>;
  /** Stores `value` under `name`, overwriting any prior value. */
  set(name: string, value: Uint8Array, signal: AbortSignal): Promise<void>;
  /** Removes the entry under `name`. Silent when absent. */
  delete(name: string, signal: AbortSignal): Promise<void>;
  /** Lists all keys this backend manages. */
  list(signal: AbortSignal): Promise<readonly string[]>;
}

export interface SignerLogger {
  debug(o: object, msg: string): void;
  warn(o: object, msg: string): void;
}

export interface SignerPlatform {
  /** Root data directory; resolves to the OS-correct application data path. */
  dataDir(): string;
  /** Directory the audit log writer appends per-alias NDJSON files into. */
  auditDir(): string;
}

/**
 * Dependencies every adapter receives at init time. Each adapter holds a
 * reference and uses them on every sign call.
 */
export interface SignerAdapterDeps {
  readonly secrets: SecretsCrypto;
  readonly keychain: KeychainBackend;
  readonly logger: SignerLogger;
  readonly events?: EmitEventPort;
  readonly platform: SignerPlatform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly allowEnv: boolean;
  readonly clock: () => number;
  readonly newRequestId: () => string;
}

/** Configuration carried per alias and forwarded to the adapter on `init`. */
export interface AddSignerOptions {
  readonly filePath?: string;
  readonly envVarName?: string;
  readonly keychainService?: string;
  readonly remoteUrl?: string;
  readonly label?: string;
}

/**
 * The internal adapter shape every signer implementation conforms to.
 * Extends both contracts ports plus a lifecycle (`init`, `dispose`) and a
 * discriminator (`kind`).
 */
export interface SignerAdapter extends SignTransactionPort, SignerInfoPort {
  readonly kind: SignerAdapterKind;
  /** Wires the adapter to its per-alias options. Idempotent. */
  init(deps: SignerInitDeps): Promise<void>;
  /** Releases any held resources. Adapters in v1 are mostly stateless. */
  dispose(): Promise<void>;
}

/**
 * Init carries the per-alias configuration on top of the shared deps so the
 * adapter knows which path/env var/keychain entry to operate on.
 */
export interface SignerInitDeps extends SignerAdapterDeps {
  readonly alias: SignerAlias;
  readonly options: AddSignerOptions;
}
