import type { SignableTransactionMessage } from "../domain/tx-plan.js";

export interface GetPriorityFeePolicyOptions {
  readonly signal: AbortSignal;
  readonly percentile?: number;
}

export interface GetPriorityFeePolicyPort {
  recommend(
    message: SignableTransactionMessage,
    opts: GetPriorityFeePolicyOptions,
  ): Promise<bigint>;
}
