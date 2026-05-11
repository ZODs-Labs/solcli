import { createSolanaRpc } from "@solana/kit";
import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { ConfigError } from "@solcli/errors";
import { createStandardRpcPorts, type StandardRpcClient } from "../../_base/rpc-ports.js";
import { defineManifest, makeProviderInstance } from "../../manifest.js";

export const TRITON_MANIFEST: ProviderManifest = defineManifest("triton", "1", [
  "getAccountInfo",
  "getBalance",
  "getTokenBalances",
  "simulateTransaction",
  "getTransaction",
  "getTransactionHistory",
]);

export interface CreateTritonProviderOptions {
  /**
   * The full HTTPS RPC URL for the customer's Triton endpoint. Triton issues
   * per-tenant URLs, so unlike Helius there is no public mainnet default.
   */
  readonly endpoint?: string;
  /** Optional bearer token for endpoints that require an Authorization header. */
  readonly bearer?: string;
  /** Legacy alias for `bearer` accepted by older configs. */
  readonly apiKey?: string;
  /**
   * Inject a pre-built RPC client. Tests pass a fake transport here; production
   * callers leave it undefined and the adapter builds the client from the URL.
   */
  readonly rpc?: StandardRpcClient;
}

export function createTritonProvider(opts: CreateTritonProviderOptions = {}): ProviderInstance {
  const rpc = opts.rpc ?? createSolanaRpc(resolveTritonEndpoint(opts));
  const bindings = createStandardRpcPorts(rpc);
  return makeProviderInstance(TRITON_MANIFEST, bindings);
}

function resolveTritonEndpoint(opts: CreateTritonProviderOptions): string {
  if (opts.endpoint === undefined || opts.endpoint.length === 0) {
    throw new ConfigError("Triton provider requires an explicit endpoint URL");
  }
  if (!opts.endpoint.startsWith("https://") && !opts.endpoint.startsWith("http://")) {
    throw new ConfigError("Triton endpoint must be an https URL", {
      details: { endpoint: opts.endpoint },
    });
  }
  return opts.endpoint;
}
