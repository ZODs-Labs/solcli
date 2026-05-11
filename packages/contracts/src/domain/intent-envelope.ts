import type { Lamports } from "./amount.js";
import type { Pubkey } from "./pubkey.js";

export interface IntentEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "write-intent";
  readonly summary: string;
  readonly payer: Pubkey;
  readonly programs: readonly Pubkey[];
  readonly lamportsDelta: Lamports;
  readonly writableAccounts: readonly Pubkey[];
  readonly costBudgetLamports: Lamports;
  readonly idempotencyKey: string;
  readonly signerAlias: string;
}
