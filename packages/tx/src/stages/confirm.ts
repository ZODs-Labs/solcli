import type { Signature } from "@solcli/contracts";

export interface ConfirmStageResult {
  readonly slot: number;
  readonly confirmationStatus: "processed" | "confirmed" | "finalized";
  readonly err?: string;
}

export interface ConfirmStageContext {
  /**
   * Resolve once the transaction has reached the desired commitment, or with
   * an `err` when the cluster reports the transaction failed. Implementations
   * back this with `@solana/transaction-confirmation`'s subscription factory
   * so a single websocket notification wakes the caller; there is no polling
   * at this layer.
   */
  readonly confirmSignature: (
    sig: Signature,
    opts: { signal: AbortSignal },
  ) => Promise<ConfirmStageResult>;
  readonly signal: AbortSignal;
}

export async function runConfirm(
  sig: Signature,
  ctx: ConfirmStageContext,
): Promise<ConfirmStageResult> {
  ctx.signal.throwIfAborted();
  return ctx.confirmSignature(sig, { signal: ctx.signal });
}
