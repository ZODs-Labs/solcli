export type SecretsBackend = "keyring" | "encrypted-file";

/** Secret store backed by OS keychain or encrypted on-disk fallback. Implemented by S1. */
export interface SecretsStore {
  set(name: string, value: string): Promise<void>;
  get(name: string): Promise<string | null>;
  delete(name: string): Promise<void>;
  list(): Promise<string[]>;
  backend(): SecretsBackend;
}
