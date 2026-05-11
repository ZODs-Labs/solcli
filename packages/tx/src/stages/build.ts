import type { Pubkey, TransactionPlan } from "@solcli/contracts";

export interface AddressLookupTableShape {
  readonly address: Pubkey;
  readonly writableIndexes: readonly number[];
  readonly readonlyIndexes: readonly number[];
}

export interface VersionedMessageShape {
  readonly version: 0;
  readonly payer: Pubkey;
  readonly recentBlockhash: string;
  readonly instructions: TransactionPlan["instructions"];
  readonly addressLookupTables: readonly AddressLookupTableShape[];
}

// TODO: the reference-protocols flow will replace this stub with the
// kit-based serializer (Solana JS SDK family). The shape here is a layout
// view of the TransactionPlan only; no wire bytes are produced.
export function buildVersionedMessage(
  plan: TransactionPlan,
  alts: readonly AddressLookupTableShape[] = [],
): VersionedMessageShape {
  return {
    version: 0,
    payer: plan.payer,
    recentBlockhash: plan.recentBlockhash,
    instructions: plan.instructions,
    addressLookupTables: alts,
  };
}
