import type { SimulationResult } from "../domain/simulation-result.js";
import type { SignableTransactionMessage } from "../domain/tx-plan.js";

export interface SimulateTransactionOptions {
  readonly signal: AbortSignal;
  readonly replaceRecentBlockhash?: boolean;
  readonly sigVerify?: boolean;
}

export interface SimulateTransactionPort {
  simulate(
    message: SignableTransactionMessage,
    opts: SimulateTransactionOptions,
  ): Promise<SimulationResult>;
}
