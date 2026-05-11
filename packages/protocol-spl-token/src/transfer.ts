import type {
  Blockhash,
  InstructionPlan,
  MintAddress,
  OwnerAddress,
  TokenAccount,
  TokenAmount,
  TransactionPlan,
} from "@solcli/contracts";
import { SPL_TOKEN_PROGRAM_ID } from "./constants.js";

export interface BuildTokenTransferPlanArgs {
  readonly owner: OwnerAddress;
  readonly source: TokenAccount;
  readonly destination: TokenAccount;
  readonly mint: MintAddress;
  readonly amount: TokenAmount;
  readonly decimals: number;
  readonly recentBlockhash: Blockhash;
  readonly priorityFeeMicroLamportsPerCu?: bigint;
  readonly computeUnitLimit?: number;
}

/**
 * Build a TransactionPlan for SPL Token TransferChecked.
 *
 * Wire format (SPL Token instruction tag 12):
 *   [0]      u8 tag = 12 (0x0c)
 *   [1..9]   u64 LE amount
 *   [9]      u8 decimals
 *
 * Account order (mandated by the program):
 *   0: source        (writable)
 *   1: mint          (read-only)
 *   2: destination   (writable)
 *   3: owner         (signer, read-only)
 *
 * Token-2022 writes are deferred: this helper targets the classic SPL Token
 * program. The mint pubkey is included so the program verifies the decimals
 * match on chain.
 */
export function buildTokenTransferPlan(args: BuildTokenTransferPlanArgs): TransactionPlan {
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > 255) {
    throw new Error(
      `buildTokenTransferPlan: decimals must be a u8 (0..=255), got ${args.decimals}`,
    );
  }

  const data = new Uint8Array(10);
  const view = new DataView(data.buffer);
  view.setUint8(0, 12);
  view.setBigUint64(1, args.amount as unknown as bigint, true);
  view.setUint8(9, args.decimals);

  const instruction: InstructionPlan = {
    programId: SPL_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: args.source, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: args.owner, isSigner: true, isWritable: false },
    ],
    data,
  };

  const plan: TransactionPlan = {
    version: 0,
    payer: args.owner,
    recentBlockhash: args.recentBlockhash,
    instructions: [instruction],
    expectedSigners: [args.owner],
    ...(args.priorityFeeMicroLamportsPerCu !== undefined
      ? { priorityFeeMicroLamportsPerCu: args.priorityFeeMicroLamportsPerCu }
      : {}),
    ...(args.computeUnitLimit !== undefined ? { computeUnitLimit: args.computeUnitLimit } : {}),
  };

  return plan;
}
