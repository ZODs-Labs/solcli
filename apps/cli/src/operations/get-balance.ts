import type { Lamports, OwnerAddress } from "@solcli/contracts";
import { resolvePort } from "./resolve-port.js";
import type { OperationDeps, OperationInvokeOptions } from "./types.js";

export async function getBalance(
  deps: OperationDeps,
  owner: OwnerAddress,
  opts: OperationInvokeOptions = {},
): Promise<Lamports> {
  const { port, provider } = resolvePort(deps.registry, "getBalance", opts.provider);
  deps.logger.debug({ provider: provider.manifest.name, op: "getBalance" }, "operation resolved");
  return port.getBalance(owner, opts.signal ? { signal: opts.signal } : undefined);
}
