import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { ConfigError } from "@solcli/errors";
import type { StandardRpcSubscriptionsClient } from "../../_base/rpc-confirm.js";
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
  readonly endpoint?: string;
  readonly websocketEndpoint?: string;
  readonly bearer?: string;
  readonly apiKey?: string;
  readonly rpc?: StandardRpcClient;
  readonly rpcSubscriptions?: StandardRpcSubscriptionsClient;
}

export interface TritonProviderInstance extends ProviderInstance {
  readonly rpc: StandardRpcClient;
  readonly rpcSubscriptions: StandardRpcSubscriptionsClient;
}

export function createTritonProvider(
  opts: CreateTritonProviderOptions = {},
): TritonProviderInstance {
  const rpc = opts.rpc ?? createSolanaRpc(resolveTritonEndpoint(opts));
  const rpcSubscriptions =
    opts.rpcSubscriptions ?? createSolanaRpcSubscriptions(resolveTritonWsEndpoint(opts));
  const bindings = createStandardRpcPorts(rpc);
  const instance = makeProviderInstance(TRITON_MANIFEST, bindings);
  return Object.assign(instance, { rpc, rpcSubscriptions });
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

function resolveTritonWsEndpoint(opts: CreateTritonProviderOptions): string {
  if (opts.websocketEndpoint !== undefined && opts.websocketEndpoint.length > 0) {
    return opts.websocketEndpoint;
  }
  if (opts.endpoint !== undefined && opts.endpoint.length > 0) {
    return opts.endpoint.replace(/^http/, "ws");
  }
  throw new ConfigError(
    "Triton provider requires websocketEndpoint when endpoint is not derivable",
  );
}
