export type * from "./common.js";
export type * from "./emit-event.js";
export type * from "./execute-transaction.js";
export type * from "./get-assets-by-owner.js";
export type * from "./get-balance.js";
export type * from "./get-portfolio.js";
export type * from "./get-priority-fee-estimate.js";
export type * from "./get-priority-fee-policy.js";
export type * from "./get-token-balances.js";
export type * from "./get-transaction.js";
export type * from "./get-transaction-history.js";
export type * from "./idl-fetch.js";
export type * from "./plugin-load.js";
export type * from "./propose-multisig-tx.js";
export type * from "./safety-evaluate.js";
export type * from "./sign-transaction.js";
export type * from "./signer-info.js";
export type * from "./simulate-transaction.js";
export type * from "./submit-bundle.js";
export type * from "./subscribe-signatures.js";

import type { EmitEventPort } from "./emit-event.js";
import type { ExecuteTransactionPort } from "./execute-transaction.js";
import type { GetAssetsByOwnerPort } from "./get-assets-by-owner.js";
import type { GetBalancePort } from "./get-balance.js";
import type { GetPortfolioPort } from "./get-portfolio.js";
import type { GetPriorityFeeEstimatePort } from "./get-priority-fee-estimate.js";
import type { GetPriorityFeePolicyPort } from "./get-priority-fee-policy.js";
import type { GetTokenBalancesPort } from "./get-token-balances.js";
import type { GetTransactionPort } from "./get-transaction.js";
import type { GetTransactionHistoryPort } from "./get-transaction-history.js";
import type { IdlFetchPort } from "./idl-fetch.js";
import type { PluginLoadPort } from "./plugin-load.js";
import type { ProposeMultisigTxPort } from "./propose-multisig-tx.js";
import type { SafetyEvaluatePort } from "./safety-evaluate.js";
import type { SignTransactionPort } from "./sign-transaction.js";
import type { SignerInfoPort } from "./signer-info.js";
import type { SimulateTransactionPort } from "./simulate-transaction.js";
import type { SubmitBundlePort } from "./submit-bundle.js";
import type { SubscribeSignaturesPort } from "./subscribe-signatures.js";

export type PortName =
  | "getBalance"
  | "getPortfolio"
  | "getTokenBalances"
  | "getAssetsByOwner"
  | "getPriorityFeeEstimate"
  | "getTransaction"
  | "getTransactionHistory"
  | "subscribeSignatures"
  | "executeTransaction"
  | "simulateTransaction"
  | "getPriorityFeePolicy"
  | "submitBundle"
  | "signTransaction"
  | "signerInfo"
  | "proposeMultisigTx"
  | "idlFetch"
  | "pluginLoad"
  | "emitEvent"
  | "safetyEvaluate";

export interface PortMap {
  readonly getBalance: GetBalancePort;
  readonly getPortfolio: GetPortfolioPort;
  readonly getTokenBalances: GetTokenBalancesPort;
  readonly getAssetsByOwner: GetAssetsByOwnerPort;
  readonly getPriorityFeeEstimate: GetPriorityFeeEstimatePort;
  readonly getTransaction: GetTransactionPort;
  readonly getTransactionHistory: GetTransactionHistoryPort;
  readonly subscribeSignatures: SubscribeSignaturesPort;
  readonly executeTransaction: ExecuteTransactionPort;
  readonly simulateTransaction: SimulateTransactionPort;
  readonly getPriorityFeePolicy: GetPriorityFeePolicyPort;
  readonly submitBundle: SubmitBundlePort;
  readonly signTransaction: SignTransactionPort;
  readonly signerInfo: SignerInfoPort;
  readonly proposeMultisigTx: ProposeMultisigTxPort;
  readonly idlFetch: IdlFetchPort;
  readonly pluginLoad: PluginLoadPort;
  readonly emitEvent: EmitEventPort;
  readonly safetyEvaluate: SafetyEvaluatePort;
}
