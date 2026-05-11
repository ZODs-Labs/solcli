import type {
  Commitment,
  GetSignatureStatusesApi,
  Signature as KitSignature,
  Rpc,
  RpcSubscriptions,
  SignatureNotificationsApi,
} from "@solana/kit";
import { createRecentSignatureConfirmationPromiseFactory } from "@solana/transaction-confirmation";
import type { Signature } from "@solcli/contracts";

export interface ConfirmStageResult {
  readonly slot: number;
  readonly confirmationStatus: "processed" | "confirmed" | "finalized";
  readonly err?: string;
}

export interface ConfirmFnDeps {
  readonly rpc: Rpc<GetSignatureStatusesApi>;
  readonly rpcSubscriptions: RpcSubscriptions<SignatureNotificationsApi>;
  /** Default commitment to wait for. The TX pipeline uses `confirmed`. */
  readonly commitment?: Commitment;
}

export type ConfirmSignatureFn = (
  sig: Signature,
  opts: { signal: AbortSignal },
) => Promise<ConfirmStageResult>;

/**
 * Build a confirm-signature function backed by Kit's
 * `createRecentSignatureConfirmationPromiseFactory`. It subscribes to the
 * cluster's `signatureSubscribe` websocket and resolves on the first
 * notification at the target commitment; there is no polling.
 *
 * On failure the underlying factory throws with the transaction error as
 * `cause`; this wrapper normalizes that into `{ err: ... }` so the caller
 * can stay synchronous about success/failure handling.
 */
export function createConfirmSignatureFn(deps: ConfirmFnDeps): ConfirmSignatureFn {
  const factory = createRecentSignatureConfirmationPromiseFactory({
    // The factory typings are cluster-branded for safety; in our adapter the
    // cluster is decided by the URL the caller passed to createSolanaRpc, so
    // we cast through `unknown` to satisfy the typed overload.
    rpc: deps.rpc as unknown as Parameters<
      typeof createRecentSignatureConfirmationPromiseFactory
    >[0]["rpc"],
    rpcSubscriptions: deps.rpcSubscriptions as unknown as Parameters<
      typeof createRecentSignatureConfirmationPromiseFactory
    >[0]["rpcSubscriptions"],
  });
  const commitment: Commitment = deps.commitment ?? "confirmed";

  return async (sig, opts) => {
    try {
      await factory({
        abortSignal: opts.signal,
        commitment,
        signature: sig as unknown as KitSignature,
      });
      return {
        slot: 0,
        confirmationStatus: commitment as ConfirmStageResult["confirmationStatus"],
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      const cause = e instanceof Error && e.cause !== undefined ? e.cause : e;
      const message = cause instanceof Error ? cause.message : String(cause);
      return { slot: 0, confirmationStatus: "processed", err: message };
    }
  };
}
