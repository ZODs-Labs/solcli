import type {
  Blockhash,
  MintAddress,
  OwnerAddress,
  TokenAccount,
  TokenAmount,
} from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { SPL_TOKEN_PROGRAM_ID } from "../src/constants.js";
import { buildTokenTransferPlan } from "../src/transfer.js";

const OWNER = "Ownerr11111111111111111111111111111111111111" as OwnerAddress;
const SOURCE = "Sourcc11111111111111111111111111111111111111" as TokenAccount;
const DESTINATION = "Destnn11111111111111111111111111111111111111" as TokenAccount;
const MINT = "Mintt111111111111111111111111111111111111111" as MintAddress;
const BLOCKHASH = "Blockk11111111111111111111111111111111111111" as Blockhash;
const AMOUNT = 1_234_567n as TokenAmount;
const DECIMALS = 6;

describe("buildTokenTransferPlan", () => {
  it("targets the SPL Token program", () => {
    const plan = buildTokenTransferPlan({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
    });

    expect(plan.version).toBe(0);
    expect(plan.payer).toBe(OWNER);
    expect(plan.recentBlockhash).toBe(BLOCKHASH);
    expect(plan.expectedSigners).toEqual([OWNER]);
    expect(plan.instructions).toHaveLength(1);

    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");
    expect(ix.programId).toBe(SPL_TOKEN_PROGRAM_ID);
    expect(ix.programId).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  });

  it("encodes data as exactly 10 bytes: tag, u64 LE amount and u8 decimals", () => {
    const plan = buildTokenTransferPlan({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.data.length).toBe(10);
    expect(ix.data[0]).toBe(0x0c);

    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(view.getBigUint64(1, true)).toBe(1_234_567n);
    expect(ix.data[9]).toBe(DECIMALS);
  });

  it("orders keys and signer / writable flags per the program contract", () => {
    const plan = buildTokenTransferPlan({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[0]).toEqual({ pubkey: SOURCE, isSigner: false, isWritable: true });
    expect(ix.keys[1]).toEqual({ pubkey: MINT, isSigner: false, isWritable: false });
    expect(ix.keys[2]).toEqual({ pubkey: DESTINATION, isSigner: false, isWritable: true });
    expect(ix.keys[3]).toEqual({ pubkey: OWNER, isSigner: true, isWritable: false });
  });

  it("propagates priority fee and compute unit limit when supplied", () => {
    const plan = buildTokenTransferPlan({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
      priorityFeeMicroLamportsPerCu: 7_500n,
      computeUnitLimit: 120_000,
    });
    expect(plan.priorityFeeMicroLamportsPerCu).toBe(7_500n);
    expect(plan.computeUnitLimit).toBe(120_000);
  });

  it("omits priority fee and compute unit limit when not supplied", () => {
    const plan = buildTokenTransferPlan({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
    });
    expect(plan.priorityFeeMicroLamportsPerCu).toBeUndefined();
    expect(plan.computeUnitLimit).toBeUndefined();
  });

  it("rejects a non u8 decimals value", () => {
    expect(() =>
      buildTokenTransferPlan({
        owner: OWNER,
        source: SOURCE,
        destination: DESTINATION,
        mint: MINT,
        amount: AMOUNT,
        decimals: 256,
        recentBlockhash: BLOCKHASH,
      }),
    ).toThrow(/decimals/);
  });
});
