import type { Blockhash, Lamports, Pubkey } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROGRAM } from "../src/constants.js";
import { buildTransferPlan } from "../src/transfer.js";

const FROM = "Aaaa1111111111111111111111111111111111111111" as Pubkey;
const TO = "Bbbb2222222222222222222222222222222222222222" as Pubkey;
const BLOCKHASH = "Cccc3333333333333333333333333333333333333333" as Blockhash;
const AMOUNT = 1_000_000n as Lamports;

describe("buildTransferPlan", () => {
  it("emits a single SystemProgram::Transfer instruction", () => {
    const plan = buildTransferPlan({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });

    expect(plan.version).toBe(0);
    expect(plan.payer).toBe(FROM);
    expect(plan.recentBlockhash).toBe(BLOCKHASH);
    expect(plan.expectedSigners).toEqual([FROM]);
    expect(plan.instructions).toHaveLength(1);

    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");
    expect(ix.programId).toBe(SYSTEM_PROGRAM);
    expect(ix.programId).toBe("11111111111111111111111111111111");
  });

  it("encodes tag=2 LE and lamports as u64 LE in 12 data bytes", () => {
    const plan = buildTransferPlan({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.data.length).toBe(12);
    expect(Array.from(ix.data.subarray(0, 4))).toEqual([0x02, 0x00, 0x00, 0x00]);

    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(view.getBigUint64(4, true)).toBe(1_000_000n);
  });

  it("sets the correct key order and signer / writable flags", () => {
    const plan = buildTransferPlan({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });
    const ix = plan.instructions[0];
    if (ix === undefined) throw new Error("instruction missing");

    expect(ix.keys).toHaveLength(2);
    expect(ix.keys[0]).toEqual({ pubkey: FROM, isSigner: true, isWritable: true });
    expect(ix.keys[1]).toEqual({ pubkey: TO, isSigner: false, isWritable: true });
  });

  it("propagates priority fee and compute unit limit when supplied", () => {
    const plan = buildTransferPlan({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
      priorityFeeMicroLamportsPerCu: 5_000n,
      computeUnitLimit: 200_000,
    });
    expect(plan.priorityFeeMicroLamportsPerCu).toBe(5_000n);
    expect(plan.computeUnitLimit).toBe(200_000);
  });

  it("omits priority fee and compute unit limit when not supplied", () => {
    const plan = buildTransferPlan({
      from: FROM,
      to: TO,
      lamports: AMOUNT,
      recentBlockhash: BLOCKHASH,
    });
    expect(plan.priorityFeeMicroLamportsPerCu).toBeUndefined();
    expect(plan.computeUnitLimit).toBeUndefined();
  });
});
