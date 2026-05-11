import type { Lamports } from "./amount.js";
import type { Pubkey } from "./pubkey.js";
import type { BlockHeight, Blockhash, Signature, Slot, UnixSeconds } from "./signature.js";

export type TransactionStatus = "success" | "failed" | "unknown";

export interface TransactionMeta {
  readonly fee: Lamports;
  readonly status: TransactionStatus;
  readonly error?: string;
  readonly slot: Slot;
  readonly blockTime?: UnixSeconds;
  readonly recentBlockhash?: Blockhash;
}

export interface Transaction {
  readonly signature: Signature;
  readonly meta: TransactionMeta;
  readonly accounts: readonly Pubkey[];
  readonly logs?: readonly string[];
}

export interface SignatureNotification {
  readonly signature: Signature;
  readonly slot: Slot;
  readonly status: TransactionStatus;
  readonly error?: string;
}

export interface SignatureFilter {
  readonly account?: Pubkey;
  readonly mentions?: readonly Pubkey[];
  readonly commitment?: "processed" | "confirmed" | "finalized";
  readonly startSlot?: Slot;
  readonly endHeight?: BlockHeight;
}
