export {
  createEnvSignerAdapter,
  ENV_SIGNER_REQUIRED_FLAG,
  EnvSignerAdapter,
} from "./adapters/env.js";
export {
  createFileSignerAdapter,
  FileSignerAdapter,
  pubkeyFromSeedBytes,
} from "./adapters/file.js";
export {
  createKeychainSignerAdapter,
  KeychainSignerAdapter,
} from "./adapters/keychain.js";
export type { AuditWriteArgs, SignerAuditEntry } from "./audit.js";
export { appendAudit, buildAuditEntry } from "./audit.js";

export { base58Decode, base58Encode } from "./base58.js";
export { ed25519PubkeyFromSeed, ed25519Sign, extractSeed } from "./ed25519.js";
export type {
  AddSignerOptions,
  KeychainBackend,
  SecretsCrypto,
  SignedTransaction,
  SignerAdapter,
  SignerAdapterDeps,
  SignerAdapterKind,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerInfoPort,
  SignerInitDeps,
  SignerLogger,
  SignerPlatform,
  SignTransactionOptions,
  SignTransactionPort,
  TransactionPlan,
} from "./port.js";
export type {
  SignerAdapterFactory,
  SignerRegistry,
  SignerRegistryDeps,
} from "./registry.js";
export { createSignerRegistry } from "./registry.js";
export { serializeMessage } from "./serialize.js";
