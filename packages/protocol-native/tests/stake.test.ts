import type { Blockhash, Lamports, Pubkey } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import {
  STAKE_CONFIG,
  STAKE_PROGRAM,
  SYSVAR_CLOCK,
  SYSVAR_STAKE_HISTORY,
} from "../src/constants.js";
import { buildDelegatePlan, buildWithdrawPlan } from "../src/stake.js";

const STAKE = "Sssstake1111111111111111111111111111111111" as Pubkey;
const VOTE = "Vote1111111111111111111111111111111111111" as Pubkey;
const AUTH = "Authh111111111111111111111111111111111111" as Pubkey;
const RECIP = "Recip111111111111111111111111111111111111" as Pubkey;
const BLOCKHASH = "Bhash111111111111111111111111111111111111" as Blockhash;

describe("buildDelegatePlan", () => {
  it("emits StakeProgram::DelegateStake with tag 2 and no payload", () => {
    const plan = buildDelegatePlan({
      stakeAccount: STAKE,
      voteAccount: VOTE,
      authorizedPubkey: AUTH,
      recentBlockhash: BLOCKHASH,
    });

    expect(plan.version).toBe(0);
    expect(plan.payer).toBe(AUTH);
    expect(plan.expectedSigners).toEqual([AUTH]);
    expect(plan.instructions).toHaveLength(1);

    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");
    expect(ix.programId).toBe(STAKE_PROGRAM);
    expect(ix.data.length).toBe(4);
    expect(Array.from(ix.data)).toEqual([0x02, 0x00, 0x00, 0x00]);
  });

  it("sets the documented key order with correct signer / writable flags", () => {
    const plan = buildDelegatePlan({
      stakeAccount: STAKE,
      voteAccount: VOTE,
      authorizedPubkey: AUTH,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.keys).toEqual([
      { pubkey: STAKE, isSigner: false, isWritable: true },
      { pubkey: VOTE, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
      { pubkey: STAKE_CONFIG, isSigner: false, isWritable: false },
      { pubkey: AUTH, isSigner: true, isWritable: false },
    ]);
  });
});

describe("buildWithdrawPlan", () => {
  it("emits StakeProgram::Withdraw with tag 4 LE and lamports u64 LE", () => {
    const amount = 2_500_000n as Lamports;
    const plan = buildWithdrawPlan({
      stakeAccount: STAKE,
      recipient: RECIP,
      withdrawAuthority: AUTH,
      lamports: amount,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.programId).toBe(STAKE_PROGRAM);
    expect(ix.data.length).toBe(12);
    expect(Array.from(ix.data.subarray(0, 4))).toEqual([0x04, 0x00, 0x00, 0x00]);

    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(view.getBigUint64(4, true)).toBe(2_500_000n);
  });

  it("sets the documented key order with correct signer / writable flags", () => {
    const amount = 1n as Lamports;
    const plan = buildWithdrawPlan({
      stakeAccount: STAKE,
      recipient: RECIP,
      withdrawAuthority: AUTH,
      lamports: amount,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.keys).toEqual([
      { pubkey: STAKE, isSigner: false, isWritable: true },
      { pubkey: RECIP, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
      { pubkey: AUTH, isSigner: true, isWritable: false },
    ]);
    expect(plan.expectedSigners).toEqual([AUTH]);
    expect(plan.payer).toBe(AUTH);
  });
});
