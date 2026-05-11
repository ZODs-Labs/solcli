import type { IntentEnvelope } from "../domain/intent-envelope.js";
import type { SignedTransaction } from "../domain/signed-transaction.js";
import type { SignerAlias } from "../domain/signer-alias.js";
import type { TransactionPlan } from "../domain/tx-plan.js";

export interface SignTransactionOptions {
  readonly signal: AbortSignal;
  readonly intent: IntentEnvelope;
}

export interface SignTransactionPort {
  sign(
    alias: SignerAlias,
    plan: TransactionPlan,
    opts: SignTransactionOptions,
  ): Promise<SignedTransaction>;
}
