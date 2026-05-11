import type { Lamports, OwnerAddress, Portfolio } from "@solcli/contracts";
import { getBalance } from "./get-balance.js";
import { getPortfolio } from "./get-portfolio.js";
import type { OperationDeps, OperationInvokeOptions } from "./types.js";

export { idlAdd, idlCall, idlList, idlRemove } from "./idl-load.js";
export { loadMcpToolList } from "./mcp-tools.js";
export { type ResolvedPort, resolvePort } from "./resolve-port.js";
export { signerSign } from "./signer-sign.js";
export { txExecute } from "./tx-execute.js";
export type { OperationDeps, OperationInvokeOptions } from "./types.js";

export interface Operations {
  getBalance(owner: OwnerAddress, opts?: OperationInvokeOptions): Promise<Lamports>;
  getPortfolio(owner: OwnerAddress, opts?: OperationInvokeOptions): Promise<Portfolio>;
}

export function createOperations(deps: OperationDeps): Operations {
  return Object.freeze<Operations>({
    getBalance: (owner: OwnerAddress, opts?: OperationInvokeOptions) =>
      getBalance(deps, owner, opts),
    getPortfolio: (owner: OwnerAddress, opts?: OperationInvokeOptions) =>
      getPortfolio(deps, owner, opts),
  });
}
