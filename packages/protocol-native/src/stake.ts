import type {
  Blockhash,
  InstructionPlan,
  Lamports,
  Pubkey,
  TransactionPlan,
} from "@solcli/contracts";
import { STAKE_CONFIG, STAKE_PROGRAM, SYSVAR_CLOCK, SYSVAR_STAKE_HISTORY } from "./constants.js";

export interface BuildDelegatePlanArgs {
  readonly stakeAccount: Pubkey;
  readonly voteAccount: Pubkey;
  readonly authorizedPubkey: Pubkey;
  readonly recentBlockhash: Blockhash;
  readonly priorityFeeMicroLamportsPerCu?: bigint;
  readonly computeUnitLimit?: number;
}

/**
 * Build a TransactionPlan for StakeProgram::DelegateStake.
 *
 * Wire format (Solana Stake Program instruction 2):
 *   [0..4]  u32 LE tag = 2  (no further data)
 *
 * Key order matches the program definition: stake, vote, clock sysvar,
 * stake history sysvar, stake config and the stake authority signer.
 *
 * TODO: confirm the stake config address against the runtime constant once
 * the v1 RPC flow lands; the literal here matches the documented value but
 * is intentionally not loaded from a network fetch in v0.
 */
export function buildDelegatePlan(args: BuildDelegatePlanArgs): TransactionPlan {
  const data = new Uint8Array(4);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);

  const instruction: InstructionPlan = {
    programId: STAKE_PROGRAM,
    keys: [
      { pubkey: args.stakeAccount, isSigner: false, isWritable: true },
      { pubkey: args.voteAccount, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
      { pubkey: STAKE_CONFIG, isSigner: false, isWritable: false },
      { pubkey: args.authorizedPubkey, isSigner: true, isWritable: false },
    ],
    data,
  };

  return {
    version: 0,
    payer: args.authorizedPubkey,
    recentBlockhash: args.recentBlockhash,
    instructions: [instruction],
    expectedSigners: [args.authorizedPubkey],
    ...(args.priorityFeeMicroLamportsPerCu !== undefined
      ? { priorityFeeMicroLamportsPerCu: args.priorityFeeMicroLamportsPerCu }
      : {}),
    ...(args.computeUnitLimit !== undefined ? { computeUnitLimit: args.computeUnitLimit } : {}),
  };
}

export interface BuildWithdrawPlanArgs {
  readonly stakeAccount: Pubkey;
  readonly recipient: Pubkey;
  readonly withdrawAuthority: Pubkey;
  readonly lamports: Lamports;
  readonly recentBlockhash: Blockhash;
  readonly priorityFeeMicroLamportsPerCu?: bigint;
  readonly computeUnitLimit?: number;
}

/**
 * Build a TransactionPlan for StakeProgram::Withdraw.
 *
 * Wire format (Solana Stake Program instruction 4):
 *   [0..4]  u32 LE tag = 4
 *   [4..12] u64 LE lamports
 */
export function buildWithdrawPlan(args: BuildWithdrawPlanArgs): TransactionPlan {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 4, true);
  view.setBigUint64(4, args.lamports as unknown as bigint, true);

  const instruction: InstructionPlan = {
    programId: STAKE_PROGRAM,
    keys: [
      { pubkey: args.stakeAccount, isSigner: false, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
      { pubkey: args.withdrawAuthority, isSigner: true, isWritable: false },
    ],
    data,
  };

  return {
    version: 0,
    payer: args.withdrawAuthority,
    recentBlockhash: args.recentBlockhash,
    instructions: [instruction],
    expectedSigners: [args.withdrawAuthority],
    ...(args.priorityFeeMicroLamportsPerCu !== undefined
      ? { priorityFeeMicroLamportsPerCu: args.priorityFeeMicroLamportsPerCu }
      : {}),
    ...(args.computeUnitLimit !== undefined ? { computeUnitLimit: args.computeUnitLimit } : {}),
  };
}
