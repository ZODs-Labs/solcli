import type { TransactionPlan } from "../domain/tx-plan.js";

export interface GetPriorityFeePolicyOptions {
  readonly signal: AbortSignal;
  readonly percentile?: number;
}

export interface GetPriorityFeePolicyPort {
  recommend(plan: TransactionPlan, opts: GetPriorityFeePolicyOptions): Promise<bigint>;
}
