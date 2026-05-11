import type {
  Blockhash,
  InstructionPlan,
  Lamports,
  Pubkey,
  TransactionPlan,
} from "@solcli/contracts";
import { SYSTEM_PROGRAM } from "./constants.js";

export interface BuildTransferPlanArgs {
  readonly from: Pubkey;
  readonly to: Pubkey;
  readonly lamports: Lamports;
  readonly recentBlockhash: Blockhash;
  readonly priorityFeeMicroLamportsPerCu?: bigint;
  readonly computeUnitLimit?: number;
}

/**
 * Build a TransactionPlan for SystemProgram::Transfer.
 *
 * Wire format (Solana System Program instruction 2):
 *   [0..4]  u32 LE tag = 2
 *   [4..12] u64 LE lamports
 *
 * TODO: when the v1 RPC client lands, the layout shim should move into
 * @solcli/solana-stubs so every native program shares one source of truth.
 */
export function buildTransferPlan(args: BuildTransferPlanArgs): TransactionPlan {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, args.lamports as unknown as bigint, true);

  const instruction: InstructionPlan = {
    programId: SYSTEM_PROGRAM,
    keys: [
      { pubkey: args.from, isSigner: true, isWritable: true },
      { pubkey: args.to, isSigner: false, isWritable: true },
    ],
    data,
  };

  const plan: TransactionPlan = {
    version: 0,
    payer: args.from,
    recentBlockhash: args.recentBlockhash,
    instructions: [instruction],
    expectedSigners: [args.from],
    ...(args.priorityFeeMicroLamportsPerCu !== undefined
      ? { priorityFeeMicroLamportsPerCu: args.priorityFeeMicroLamportsPerCu }
      : {}),
    ...(args.computeUnitLimit !== undefined ? { computeUnitLimit: args.computeUnitLimit } : {}),
  };

  return plan;
}
