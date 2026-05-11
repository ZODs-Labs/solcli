import type {
  IntentEnvelope,
  SignedTransaction,
  SignerAlias,
  SignTransactionPort,
  TransactionPlan,
} from "@solcli/contracts";
import type { Context } from "../context.js";
import { resolvePort } from "./resolve-port.js";

export interface SignerSignArgs {
  readonly alias: SignerAlias;
  readonly plan: TransactionPlan;
  readonly intent: IntentEnvelope;
  readonly signal: AbortSignal;
}

/**
 * Adapter that implements the SignTransactionPort contract by delegating to
 * the active signer for the alias. Today this routes through the registered
 * provider; the wiring session will swap in a dedicated SignerManager that
 * resolves file, keychain or ledger backends per the provided alias.
 *
 * TODO: wiring -- expose ctx.signers.get(alias).sign(...) and route through
 * that surface instead of the provider-bound SignTransactionPort.
 */
export async function signerSign(ctx: Context, args: SignerSignArgs): Promise<SignedTransaction> {
  args.signal.throwIfAborted();
  const port: SignTransactionPort = resolvePort(ctx.providers, "signTransaction").port;
  return port.sign(args.alias, args.plan, {
    signal: args.signal,
    intent: args.intent,
  });
}
