import type { KeychainBackend } from "../../src/port.js";

/**
 * In-memory keychain for tests. Mirrors the shape of the wiring-layer
 * adapter around `@solcli/secrets` so the signer package's keychain
 * adapter never touches the real OS keychain.
 */
export class MemoryKeychainBackend implements KeychainBackend {
  private readonly entries = new Map<string, Uint8Array>();

  async get(name: string, signal: AbortSignal): Promise<Uint8Array | null> {
    signal.throwIfAborted();
    const v = this.entries.get(name);
    return v ? new Uint8Array(v) : null;
  }

  async set(name: string, value: Uint8Array, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    this.entries.set(name, new Uint8Array(value));
  }

  async delete(name: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    this.entries.delete(name);
  }

  async list(signal: AbortSignal): Promise<readonly string[]> {
    signal.throwIfAborted();
    return [...this.entries.keys()].sort();
  }
}
