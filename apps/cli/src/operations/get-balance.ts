import type { Lamports, OwnerAddress } from "@solcli/contracts";
import { ProviderError, RpcError, RpcRateLimitError, RpcTimeoutError } from "@solcli/errors";
import { resolvePortCandidates } from "./resolve-port.js";
import type { OperationDeps, OperationInvokeOptions } from "./types.js";

export async function getBalance(
  deps: OperationDeps,
  owner: OwnerAddress,
  opts: OperationInvokeOptions = {},
): Promise<Lamports> {
  const candidates = resolvePortCandidates(deps.registry, "getBalance", opts.provider);
  for (const [index, { port, provider }] of candidates.entries()) {
    try {
      deps.logger.debug(
        { provider: provider.manifest.name, op: "getBalance" },
        "operation resolved",
      );
      return await port.getBalance(owner, opts.signal ? { signal: opts.signal } : undefined);
    } catch (err: unknown) {
      if (!isFallbackError(err) || index === candidates.length - 1 || opts.provider) throw err;
      deps.logger.warn(
        {
          provider: provider.manifest.name,
          nextProvider: candidates[index + 1]?.provider.manifest.name,
          op: "getBalance",
        },
        "operation falling back",
      );
    }
  }
  throw new ProviderError("No provider returned a balance");
}

function isFallbackError(err: unknown): boolean {
  return (
    err instanceof ProviderError ||
    err instanceof RpcError ||
    err instanceof RpcTimeoutError ||
    err instanceof RpcRateLimitError
  );
}
