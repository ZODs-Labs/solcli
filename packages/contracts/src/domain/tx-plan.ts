import type { Pubkey } from "./pubkey.js";
import type { Blockhash } from "./signature.js";

export interface InstructionAccountMeta {
  readonly pubkey: Pubkey;
  readonly isSigner: boolean;
  readonly isWritable: boolean;
}

export interface InstructionPlan {
  readonly programId: Pubkey;
  readonly keys: readonly InstructionAccountMeta[];
  readonly data: Uint8Array;
}

export interface TransactionPlan {
  readonly version: 0;
  readonly payer: Pubkey;
  readonly recentBlockhash: Blockhash;
  readonly instructions: readonly InstructionPlan[];
  readonly addressLookupTables?: readonly Pubkey[];
  readonly priorityFeeMicroLamportsPerCu?: bigint;
  readonly computeUnitLimit?: number;
  readonly expectedSigners: readonly Pubkey[];
  readonly tags?: Readonly<Record<string, string>>;
}
