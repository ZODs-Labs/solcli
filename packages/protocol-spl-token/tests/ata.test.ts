import type { MintAddress, OwnerAddress } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { deriveAtaAddress } from "../src/ata.js";
import { decodeBase58 } from "../src/base58.js";
import { SPL_TOKEN_PROGRAM_ID } from "../src/constants.js";

const OWNER = "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde" as OwnerAddress;
const MINT_NATIVE = "So11111111111111111111111111111111111111112" as MintAddress;
const MINT_OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as MintAddress;

describe("deriveAtaAddress", () => {
  it("is deterministic for fixed inputs", () => {
    const a = deriveAtaAddress(OWNER, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID);
    const b = deriveAtaAddress(OWNER, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID);
    expect(a).toBe(b);
  });

  it("returns a 32 byte base58 address", () => {
    const ata = deriveAtaAddress(OWNER, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID);
    const bytes = decodeBase58(ata);
    expect(bytes.length).toBe(32);
    expect(typeof ata).toBe("string");
    expect(ata.length).toBeGreaterThanOrEqual(32);
    expect(ata.length).toBeLessThanOrEqual(44);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(ata)).toBe(true);
  });

  it("differs across mints for the same owner and token program", () => {
    const native = deriveAtaAddress(OWNER, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID);
    const other = deriveAtaAddress(OWNER, MINT_OTHER, SPL_TOKEN_PROGRAM_ID);
    expect(native).not.toBe(other);
  });

  it("rejects pubkey inputs that do not decode to 32 bytes", () => {
    const bad = "abc" as OwnerAddress;
    expect(() => deriveAtaAddress(bad, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID)).toThrow(/owner/);
  });

  // TODO: lock in the canonical mainnet ATA for (OWNER, MINT_NATIVE, SPL_TOKEN_PROGRAM_ID)
  // once @solcli/solana-stubs ships the ed25519 on-curve helper; today the
  // derivation uses a placeholder isOnCurve, so the value is not yet the
  // canonical ATA. The structural assertions above are the must-pass contract.
  it.todo("matches the canonical mainnet ATA once the on-curve helper ships");
});
