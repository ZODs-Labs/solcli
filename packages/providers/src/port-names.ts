import type { PortName } from "@solcli/contracts";

export const ALL_PORT_NAMES: readonly PortName[] = [
  "getAccountInfo",
  "getBalance",
  "getPortfolio",
  "getTokenBalances",
  "getAssetsByOwner",
  "getPriorityFeeEstimate",
  "getTransaction",
  "getTransactionHistory",
  "subscribeSignatures",
] as const;
