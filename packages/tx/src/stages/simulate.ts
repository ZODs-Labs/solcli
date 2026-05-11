import type {
  SignableTransactionMessage,
  SimulateTransactionPort,
  SimulationResult,
} from "@solcli/contracts";

export interface SimulateStageContext {
  readonly simulate: SimulateTransactionPort;
  readonly signal: AbortSignal;
}

export async function runSimulate(
  plan: SignableTransactionMessage,
  ctx: SimulateStageContext,
): Promise<SimulationResult> {
  ctx.signal.throwIfAborted();
  return ctx.simulate.simulate(plan, { signal: ctx.signal });
}
