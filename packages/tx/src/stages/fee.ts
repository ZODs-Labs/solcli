import type {
  FeePolicy,
  GetPriorityFeePolicyPort,
  SimulationResult,
  TransactionPlan,
} from "@solcli/contracts";

export interface FeeStageContext {
  readonly fee: GetPriorityFeePolicyPort;
  readonly signal: AbortSignal;
  readonly policy: FeePolicy;
  readonly percentile?: number;
}

export async function estimateFee(
  plan: TransactionPlan,
  _simulation: SimulationResult,
  ctx: FeeStageContext,
): Promise<bigint> {
  ctx.signal.throwIfAborted();
  switch (ctx.policy.kind) {
    case "none":
      return 0n;
    case "jito":
      // Jito bundle tip is charged in the bundle path, not via compute-unit price.
      return 0n;
    case "recent":
    case "helius":
    case "triton": {
      const percentile = ctx.percentile ?? 75;
      return ctx.fee.recommend(plan, { signal: ctx.signal, percentile });
    }
    default: {
      const _exhaustive: never = ctx.policy;
      return _exhaustive;
    }
  }
}
