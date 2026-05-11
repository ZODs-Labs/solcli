import type { OwnerAddress, Portfolio } from "@solcli/contracts";
import { ProviderError, RpcError, RpcRateLimitError, RpcTimeoutError } from "@solcli/errors";
import { resolvePortCandidates } from "./resolve-port.js";
import type { OperationDeps, OperationInvokeOptions } from "./types.js";

export async function getPortfolio(
  deps: OperationDeps,
  owner: OwnerAddress,
  opts: OperationInvokeOptions = {},
): Promise<Portfolio> {
  const candidates = resolvePortCandidates(deps.registry, "getPortfolio", opts.provider);
  for (const [index, { port, provider }] of candidates.entries()) {
    try {
      deps.logger.debug(
        { provider: provider.manifest.name, op: "getPortfolio" },
        "operation resolved",
      );
      return await port.getPortfolio(owner, opts.signal ? { signal: opts.signal } : undefined);
    } catch (err: unknown) {
      if (!isFallbackError(err) || index === candidates.length - 1 || opts.provider) throw err;
      deps.logger.warn(
        {
          provider: provider.manifest.name,
          nextProvider: candidates[index + 1]?.provider.manifest.name,
          op: "getPortfolio",
        },
        "operation falling back",
      );
    }
  }
  throw new ProviderError("No provider returned a portfolio");
}

function isFallbackError(err: unknown): boolean {
  return (
    err instanceof ProviderError ||
    err instanceof RpcError ||
    err instanceof RpcTimeoutError ||
    err instanceof RpcRateLimitError
  );
}
