import { STAKE_PROGRAM_ADDRESS } from "@solana-program/stake";
import type { Address, Blockhash, Lamports } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { buildDelegateMessage, buildWithdrawMessage } from "../src/stake.js";

const STAKE = "STAKE1111111111111111111111111111111111111" as Address;
const VOTE = "VOTE22222222222222222222222222222222222222" as Address;
const AUTHORITY = "AUTH3333333333333333333333333333333333333" as Address;
const RECIPIENT = "RECP4444444444444444444444444444444444444" as Address;
const BLOCKHASH = "BH555555555555555555555555555555555555555" as Blockhash;
const LAMPORTS = 1_000n as Lamports;

describe("buildDelegateMessage", () => {
  it("composes a v0 message with the stake program as the instruction target", () => {
    const msg = buildDelegateMessage({
      stakeAccount: STAKE,
      voteAccount: VOTE,
      authorizedPubkey: AUTHORITY,
      recentBlockhash: BLOCKHASH,
    });
    expect(msg.version).toBe(0);
    expect(msg.feePayer.address).toBe(AUTHORITY);
    expect(msg.lifetimeConstraint.blockhash).toBe(BLOCKHASH);
    expect(msg.instructions).toHaveLength(1);
    expect(msg.instructions[0]?.programAddress).toBe(STAKE_PROGRAM_ADDRESS);
  });
});

describe("buildWithdrawMessage", () => {
  it("composes a v0 message and pays from the withdraw authority", () => {
    const msg = buildWithdrawMessage({
      stakeAccount: STAKE,
      recipient: RECIPIENT,
      withdrawAuthority: AUTHORITY,
      lamports: LAMPORTS,
      recentBlockhash: BLOCKHASH,
    });
    expect(msg.version).toBe(0);
    expect(msg.feePayer.address).toBe(AUTHORITY);
    expect(msg.lifetimeConstraint.blockhash).toBe(BLOCKHASH);
    expect(msg.instructions).toHaveLength(1);
    expect(msg.instructions[0]?.programAddress).toBe(STAKE_PROGRAM_ADDRESS);
  });
});
