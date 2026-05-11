import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { ConfigError } from "@solcli/errors";
import type { StandardRpcSubscriptionsClient } from "../../_base/rpc-confirm.js";
import { createStandardRpcPorts, type StandardRpcClient } from "../../_base/rpc-ports.js";
import { defineManifest, makeProviderInstance } from "../../manifest.js";

export const HELIUS_MANIFEST: ProviderManifest = defineManifest("helius", "1", [
  "getAccountInfo",
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
  /** Full WSS subscriptions URL; derived from `apiKey`/`network` when omitted. */
  readonly websocketEndpoint?: string;
  /** Network selector for URL derivation. Defaults to mainnet-beta. */
  readonly network?: HeliusNetwork;
  /**
   * Inject a pre-built RPC client. Tests pass a fake transport here; production
   * callers leave it undefined and the adapter builds the client from the URL.
   */
  readonly rpc?: StandardRpcClient;
  /** Inject a pre-built subscriptions client (for tests). */
  readonly rpcSubscriptions?: StandardRpcSubscriptionsClient;
}

/**
 * A `ProviderInstance` extended with the Kit primitives the tx-service layer
 * needs (`rpc` for sending, `rpcSubscriptions` for confirm-by-subscription).
 * The provider registry only sees the standard `ProviderInstance` shape;
 * wiring code that needs the underlying clients accesses them through this
 * extended type.
 */
export interface HeliusProviderInstance extends ProviderInstance {
  readonly rpc: StandardRpcClient;
  readonly rpcSubscriptions: StandardRpcSubscriptionsClient;
}

export function createHeliusProvider(
  opts: CreateHeliusProviderOptions = {},
): HeliusProviderInstance {
  const rpc = opts.rpc ?? createSolanaRpc(resolveHeliusEndpoint(opts));
  const rpcSubscriptions =
    opts.rpcSubscriptions ?? createSolanaRpcSubscriptions(resolveHeliusWsEndpoint(opts));
  const bindings = createStandardRpcPorts(rpc);
  const instance = makeProviderInstance(HELIUS_MANIFEST, bindings);
  return Object.assign(instance, { rpc, rpcSubscriptions });
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

function resolveHeliusWsEndpoint(opts: CreateHeliusProviderOptions): string {
  if (opts.websocketEndpoint !== undefined && opts.websocketEndpoint.length > 0) {
    if (
      !opts.websocketEndpoint.startsWith("wss://") &&
      !opts.websocketEndpoint.startsWith("ws://")
    ) {
      throw new ConfigError("Helius websocketEndpoint must be a wss:// URL", {
        details: { websocketEndpoint: opts.websocketEndpoint },
      });
    }
    return opts.websocketEndpoint;
  }
  // If a custom HTTP endpoint was set without a matching WSS, derive by
  // swapping the scheme. This is best-effort; callers with a different WSS
  // host should set `websocketEndpoint` explicitly.
  if (opts.endpoint !== undefined && opts.endpoint.length > 0) {
    return opts.endpoint.replace(/^http/, "ws");
  }
  if (opts.apiKey === undefined || opts.apiKey.length === 0) {
    throw new ConfigError("Helius provider requires apiKey or websocketEndpoint");
  }
  const network = opts.network ?? "mainnet-beta";
  const host = network === "devnet" ? "devnet.helius-rpc.com" : "mainnet.helius-rpc.com";
  return `wss://${host}/?api-key=${encodeURIComponent(opts.apiKey)}`;
}
