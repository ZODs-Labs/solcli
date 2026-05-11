import type { Signature } from "@solcli/contracts";
import { sleepWithSignal } from "../sleep.js";

export interface ConfirmStageResult {
  readonly slot: number;
  readonly confirmationStatus: "processed" | "confirmed" | "finalized";
  readonly err?: string;
}

export interface ConfirmStageContext {
  readonly confirmSignature: (
    sig: Signature,
    opts: { signal: AbortSignal },
  ) => Promise<ConfirmStageResult>;
  readonly signal: AbortSignal;
}

const POLL_DELAYS_MS = [200, 400, 800, 1600, 3200] as const;

export async function runConfirm(
  sig: Signature,
  ctx: ConfirmStageContext,
): Promise<ConfirmStageResult> {
  let last: ConfirmStageResult | undefined;
  for (let i = 0; i < POLL_DELAYS_MS.length; i += 1) {
    ctx.signal.throwIfAborted();
    last = await ctx.confirmSignature(sig, { signal: ctx.signal });
    if (last.err !== undefined) return last;
    if (last.confirmationStatus === "confirmed" || last.confirmationStatus === "finalized") {
      return last;
    }
    const delay = POLL_DELAYS_MS[i];
    if (delay === undefined) break;
    await sleepWithSignal(delay, ctx.signal);
  }
  return last ?? { slot: 0, confirmationStatus: "processed" };
}
