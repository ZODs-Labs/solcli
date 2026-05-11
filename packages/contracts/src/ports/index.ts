export type * from "./common.js";
export type * from "./get-assets-by-owner.js";
export type * from "./get-balance.js";
export type * from "./get-portfolio.js";
export type * from "./get-priority-fee-estimate.js";
export type * from "./get-token-balances.js";
export type * from "./get-transaction.js";
export type * from "./get-transaction-history.js";
export type * from "./subscribe-signatures.js";

import type { GetAssetsByOwnerPort } from "./get-assets-by-owner.js";
import type { GetBalancePort } from "./get-balance.js";
import type { GetPortfolioPort } from "./get-portfolio.js";
import type { GetPriorityFeeEstimatePort } from "./get-priority-fee-estimate.js";
import type { GetTokenBalancesPort } from "./get-token-balances.js";
import type { GetTransactionPort } from "./get-transaction.js";
import type { GetTransactionHistoryPort } from "./get-transaction-history.js";
import type { SubscribeSignaturesPort } from "./subscribe-signatures.js";

export type PortName =
  | "getBalance"
  | "getPortfolio"
  | "getTokenBalances"
  | "getAssetsByOwner"
  | "getPriorityFeeEstimate"
  | "getTransaction"
  | "getTransactionHistory"
  | "subscribeSignatures";

export interface PortMap {
  readonly getBalance: GetBalancePort;
  readonly getPortfolio: GetPortfolioPort;
  readonly getTokenBalances: GetTokenBalancesPort;
  readonly getAssetsByOwner: GetAssetsByOwnerPort;
  readonly getPriorityFeeEstimate: GetPriorityFeeEstimatePort;
  readonly getTransaction: GetTransactionPort;
  readonly getTransactionHistory: GetTransactionHistoryPort;
  readonly subscribeSignatures: SubscribeSignaturesPort;
}
