import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type {
  Blockhash,
  MintAddress,
  OwnerAddress,
  TokenAccount,
  TokenAmount,
} from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { buildTokenTransferMessage } from "../src/transfer.js";

const OWNER = "Ownerr11111111111111111111111111111111111111" as OwnerAddress;
const SOURCE = "Sourcc11111111111111111111111111111111111111" as TokenAccount;
const DESTINATION = "Destnn11111111111111111111111111111111111111" as TokenAccount;
const MINT = "Mintt111111111111111111111111111111111111111" as MintAddress;
const BLOCKHASH = "Blockk11111111111111111111111111111111111111" as Blockhash;
const AMOUNT = 1_234_567n as TokenAmount;
const DECIMALS = 6;

describe("buildTokenTransferMessage", () => {
  it("targets the SPL Token program and carries the owner as the fee payer", () => {
    const msg = buildTokenTransferMessage({
      owner: OWNER,
      source: SOURCE,
      destination: DESTINATION,
      mint: MINT,
      amount: AMOUNT,
      decimals: DECIMALS,
      recentBlockhash: BLOCKHASH,
    });

    expect(msg.version).toBe(0);
    expect(msg.feePayer.address).toBe(OWNER);
    expect(msg.lifetimeConstraint.blockhash).toBe(BLOCKHASH);
    expect(msg.instructions).toHaveLength(1);
    expect(msg.instructions[0]?.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
  });

  it("rejects out-of-range decimals", () => {
    expect(() =>
      buildTokenTransferMessage({
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
