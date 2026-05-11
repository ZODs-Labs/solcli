import type { EventRecord } from "../domain/event-record.js";
import type { Result } from "../domain/result.js";
import type { Signature } from "../domain/signature.js";
import type { TransactionPlan } from "../domain/tx-plan.js";

export interface ExecuteTransactionOptions {
  readonly signal: AbortSignal;
  readonly idempotencyKey: string;
  readonly costBudgetLamports: bigint;
  readonly allowedPrograms: readonly string[];
  readonly via?: "rpc" | "jito";
  readonly events?: (record: EventRecord) => void;
}

export interface ExecuteTransactionPort {
  execute(
    plan: TransactionPlan,
    opts: ExecuteTransactionOptions,
  ): Promise<Result<Signature, unknown>>;
}
