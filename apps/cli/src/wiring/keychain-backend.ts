import type { SecretsStore } from "@solcli/contracts";
import type { KeychainBackend } from "@solcli/signer";

/**
 * Adapter that exposes a `KeychainBackend` (bytes in, bytes out) on top of
 * the bytes-as-base64 SecretsStore. The signer-keychain adapter calls into
 * this, the SecretsStore in turn talks to the OS keyring (or the encrypted
 * file fallback) via @solcli/secrets.
 *
 * Encoding: secrets are stored as base64 strings under a namespaced key
 * (`signer/<alias>`) so the same SecretsStore can host both API keys and
 * raw signer keypair bytes without collision.
 */
export function createKeychainBackend(store: SecretsStore): KeychainBackend {
  const namespaced = (name: string): string =>
    name.startsWith("signer/") ? name : `signer/${name}`;

  return {
    async get(name, signal): Promise<Uint8Array | null> {
      signal.throwIfAborted();
      const raw = await store.get(namespaced(name));
      if (raw === null) return null;
      return new Uint8Array(Buffer.from(raw, "base64"));
    },
    async set(name, value, signal): Promise<void> {
      signal.throwIfAborted();
      await store.set(namespaced(name), Buffer.from(value).toString("base64"));
    },
    async delete(name, signal): Promise<void> {
      signal.throwIfAborted();
      await store.delete(namespaced(name));
    },
    async list(signal): Promise<readonly string[]> {
      signal.throwIfAborted();
      const all = await store.list();
      return all.filter((n) => n.startsWith("signer/")).map((n) => n.slice("signer/".length));
    },
  };
}
