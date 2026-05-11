import type { Lamports } from "../domain/amount.js";
import type { PortCallOptions } from "./common.js";

export type PriorityLevel = "min" | "low" | "medium" | "high" | "veryHigh" | "unsafeMax";

export interface PriorityFeeRequest {
  readonly serializedTransaction: Uint8Array;
  readonly priorityLevel: PriorityLevel;
}

export interface GetPriorityFeeEstimatePort {
  getPriorityFeeEstimate(req: PriorityFeeRequest, opts?: PortCallOptions): Promise<Lamports>;
}
