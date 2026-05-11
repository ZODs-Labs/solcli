import type { OwnerAddress, Portfolio } from "@solcli/contracts";
import { resolvePort } from "./resolve-port.js";
import type { OperationDeps, OperationInvokeOptions } from "./types.js";

export async function getPortfolio(
  deps: OperationDeps,
  owner: OwnerAddress,
  opts: OperationInvokeOptions = {},
): Promise<Portfolio> {
  const { port, provider } = resolvePort(deps.registry, "getPortfolio", opts.provider);
  deps.logger.debug({ provider: provider.manifest.name, op: "getPortfolio" }, "operation resolved");
  return port.getPortfolio(owner, opts.signal ? { signal: opts.signal } : undefined);
}
