import type { Lamports } from "./amount.js";
import type { Pubkey } from "./pubkey.js";
import type { SignedTransaction } from "./signed-transaction.js";

export interface Bundle {
  readonly transactions: readonly SignedTransaction[];
  readonly tipAccount: Pubkey;
  readonly tipLamports: Lamports;
}
