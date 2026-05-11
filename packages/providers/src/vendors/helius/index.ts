import { createSolanaRpc } from "@solana/kit";
import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { ConfigError } from "@solcli/errors";
import { createStandardRpcPorts, type StandardRpcClient } from "../../_base/rpc-ports.js";
import { defineManifest, makeProviderInstance } from "../../manifest.js";

export const HELIUS_MANIFEST: ProviderManifest = defineManifest("helius", "1", [
  "getBalance",
  "getTokenBalances",
  "simulateTransaction",
  "getTransaction",
  "getTransactionHistory",
]);

export type HeliusNetwork = "mainnet-beta" | "devnet";

export interface CreateHeliusProviderOptions {
  /** Helius API key. Required unless an explicit `endpoint` URL is supplied. */
  readonly apiKey?: string;
  /** Full HTTPS RPC URL; overrides `apiKey`/`network` when provided. */
  readonly endpoint?: string;
  /** Network selector for URL derivation. Defaults to mainnet-beta. */
  readonly network?: HeliusNetwork;
  /**
   * Inject a pre-built RPC client. Tests pass a fake transport here; production
   * callers leave it undefined and the adapter builds the client from the URL.
   */
  readonly rpc?: StandardRpcClient;
}

export function createHeliusProvider(opts: CreateHeliusProviderOptions = {}): ProviderInstance {
  const rpc = opts.rpc ?? createSolanaRpc(resolveHeliusEndpoint(opts));
  const bindings = createStandardRpcPorts(rpc);
  return makeProviderInstance(HELIUS_MANIFEST, bindings);
}

function resolveHeliusEndpoint(opts: CreateHeliusProviderOptions): string {
  if (opts.endpoint !== undefined && opts.endpoint.length > 0) {
    if (!opts.endpoint.startsWith("https://") && !opts.endpoint.startsWith("http://")) {
      throw new ConfigError("Helius endpoint must be an https URL", {
        details: { endpoint: opts.endpoint },
      });
    }
    return opts.endpoint;
  }
  if (opts.apiKey === undefined || opts.apiKey.length === 0) {
    throw new ConfigError("Helius provider requires apiKey or endpoint");
  }
  const network = opts.network ?? "mainnet-beta";
  const host = network === "devnet" ? "devnet.helius-rpc.com" : "mainnet.helius-rpc.com";
  return `https://${host}/?api-key=${encodeURIComponent(opts.apiKey)}`;
}
