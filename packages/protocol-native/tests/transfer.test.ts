import { AccountRole } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import type { Address, Blockhash, Lamports } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { buildTransferMessage } from "../src/transfer.js";

const FROM = "Aaaa1111111111111111111111111111111111111111" as Address;
const TO = "Bbbb2222222222222222222222222222222222222222" as Address;
const BLOCKHASH = "Cccc3333333333333333333333333333333333333333" as Blockhash;
const AMOUNT = 1_000_000n as Lamports;

describe("buildTransferMessage", () => {
  it("composes a v0 message with a single SystemProgram::Transfer instruction", () => {
    const msg = buildTransferMessage({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });

    expect(msg.version).toBe(0);
    expect(msg.feePayer.address).toBe(FROM);
    expect(msg.lifetimeConstraint.blockhash).toBe(BLOCKHASH);
    expect(msg.instructions).toHaveLength(1);

    const ix = msg.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");
    expect(ix.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
  });

  it("marks the source as a writable signer and the destination as writable", () => {
    const msg = buildTransferMessage({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });
    const ix = msg.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");
    expect(ix.accounts).toBeDefined();
    const accounts = ix.accounts ?? [];
    expect(accounts[0]?.address).toBe(FROM);
    expect(accounts[0]?.role).toBe(AccountRole.WRITABLE_SIGNER);
    expect(accounts[1]?.address).toBe(TO);
    expect(accounts[1]?.role).toBe(AccountRole.WRITABLE);
  });
});
