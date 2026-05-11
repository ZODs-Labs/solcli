import type { SimulateTransactionPort, SimulationResult, TransactionPlan } from "@solcli/contracts";

export interface SimulateStageContext {
  readonly simulate: SimulateTransactionPort;
  readonly signal: AbortSignal;
}

export async function runSimulate(
  plan: TransactionPlan,
  ctx: SimulateStageContext,
): Promise<SimulationResult> {
  ctx.signal.throwIfAborted();
  return ctx.simulate.simulate(plan, { signal: ctx.signal });
}
