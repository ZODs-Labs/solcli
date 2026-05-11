import type { SimulationResult } from "../domain/simulation-result.js";
import type { TransactionPlan } from "../domain/tx-plan.js";

export interface SimulateTransactionOptions {
  readonly signal: AbortSignal;
  readonly replaceRecentBlockhash?: boolean;
  readonly sigVerify?: boolean;
}

export interface SimulateTransactionPort {
  simulate(plan: TransactionPlan, opts: SimulateTransactionOptions): Promise<SimulationResult>;
}
