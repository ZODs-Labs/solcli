import type {
  IntentEnvelope,
  SignedTransaction,
  SignerAlias,
  SignTransactionPort,
  TransactionPlan,
} from "@solcli/contracts";

export interface SignStageContext {
  readonly sign: SignTransactionPort;
  readonly signal: AbortSignal;
  readonly intent: IntentEnvelope;
}

export async function runSign(
  alias: SignerAlias,
  plan: TransactionPlan,
  ctx: SignStageContext,
): Promise<SignedTransaction> {
  ctx.signal.throwIfAborted();
  return ctx.sign.sign(alias, plan, { signal: ctx.signal, intent: ctx.intent });
}
