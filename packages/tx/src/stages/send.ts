import type {
  Lamports,
  Pubkey,
  Signature,
  SignedTransaction,
  SubmitBundlePort,
} from "@solcli/contracts";
import { TxBlockhashExpiredV2Error } from "@solcli/errors";

export interface SendStageContext {
  readonly sendRawTransaction: (
    signed: SignedTransaction,
    opts: { signal: AbortSignal },
  ) => Promise<Signature>;
  readonly bundle: SubmitBundlePort | undefined;
  readonly signal: AbortSignal;
  readonly tipAccount: Pubkey | undefined;
  readonly tipLamports: Lamports | undefined;
}

export type SendVia = "rpc" | "jito";

export async function runSend(
  signed: SignedTransaction,
  ctx: SendStageContext,
  via: SendVia,
): Promise<Signature> {
  ctx.signal.throwIfAborted();
  try {
    if (via === "jito" && ctx.bundle !== undefined) {
      const tipAccount = ctx.tipAccount ?? signed.payer;
      const tipLamports = ctx.tipLamports ?? (0n as Lamports);
      const sigs = await ctx.bundle.submit(
        { transactions: [signed], tipAccount, tipLamports },
        { signal: ctx.signal },
      );
      const first = sigs[0];
      if (first === undefined) {
        throw new TxBlockhashExpiredV2Error("Bundle submission returned no signatures");
      }
      return first;
    }
    return await ctx.sendRawTransaction(signed, { signal: ctx.signal });
  } catch (err: unknown) {
    if (isBlockhashExpired(err)) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new TxBlockhashExpiredV2Error("Blockhash not found; refresh required", { cause });
    }
    throw err;
  }
}

function isBlockhashExpired(err: unknown): boolean {
  if (err instanceof TxBlockhashExpiredV2Error) return true;
  if (err instanceof Error) {
    if (/blockhash\s*not\s*found/i.test(err.message)) return true;
    if (/blockhash\s*expired/i.test(err.message)) return true;
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /BLOCKHASH/i.test(code)) return true;
  }
  return false;
}
