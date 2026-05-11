import {
  AccountRole,
  type Address,
  address,
  appendTransactionMessageInstructions,
  type Blockhash,
  compileTransaction,
  createTransactionMessage,
  type Instruction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { TransactionPlan } from "@solcli/contracts";

/**
 * Compile a `TransactionPlan` to canonical Solana v0 message wire bytes.
 *
 * Returns the exact bytes the signer must sign over: the v0 message format the
 * runtime verifies signatures against. Lookup-table resolution is not done here
 * because the wiring layer is responsible for pre-resolving any ALTs before
 * handing a plan to the signer; this function rejects plans that declare ALTs.
 */
export function serializeMessage(plan: TransactionPlan): Uint8Array {
  if (plan.addressLookupTables !== undefined && plan.addressLookupTables.length > 0) {
    throw new Error("serializeMessage: address lookup tables must be resolved before signing");
  }

  const instructions: Instruction[] = plan.instructions.map((ix) => ({
    programAddress: address(ix.programId as unknown as string),
    accounts: ix.keys.map((k) => ({
      address: address(k.pubkey as unknown as string),
      role: roleFromFlags(k.isSigner, k.isWritable),
    })),
    data: ix.data,
  }));

  const empty = createTransactionMessage({ version: 0 });
  const withPayer = setTransactionMessageFeePayer(address(plan.payer as unknown as string), empty);
  const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: plan.recentBlockhash as unknown as Blockhash,
      // Not encoded into the message bytes; only used as a client-side hint.
      lastValidBlockHeight: 0n,
    },
    withPayer,
  );
  const message = appendTransactionMessageInstructions(instructions, withLifetime);

  const compiled = compileTransaction(message);
  return new Uint8Array(compiled.messageBytes);
}

function roleFromFlags(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) return AccountRole.WRITABLE_SIGNER;
  if (isSigner) return AccountRole.READONLY_SIGNER;
  if (isWritable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

// Type re-export so callers that only know us can name the address brand.
export type { Address };
