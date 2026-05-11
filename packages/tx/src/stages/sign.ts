import type {
  IntentEnvelope,
  SignableTransactionMessage,
  SignedTransaction,
  SignerAlias,
  SignTransactionPort,
} from "@solcli/contracts";

export interface SignStageContext {
  readonly sign: SignTransactionPort;
  readonly signal: AbortSignal;
  readonly intent: IntentEnvelope;
}

export async function runSign(
  alias: SignerAlias,
  plan: SignableTransactionMessage,
  ctx: SignStageContext,
): Promise<SignedTransaction> {
  ctx.signal.throwIfAborted();
  return ctx.sign.sign(alias, plan, { signal: ctx.signal, intent: ctx.intent });
}
