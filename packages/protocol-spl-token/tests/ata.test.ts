import { getBase58Encoder } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type { MintAddress, OwnerAddress } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { deriveAtaAddress } from "../src/ata.js";

const OWNER = "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde" as OwnerAddress;
const MINT_NATIVE = "So11111111111111111111111111111111111111112" as MintAddress;
const MINT_OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as MintAddress;
const BASE58_ENCODER = getBase58Encoder();

describe("deriveAtaAddress", () => {
  it("is deterministic for fixed inputs", async () => {
    const a = await deriveAtaAddress(OWNER, MINT_NATIVE, TOKEN_PROGRAM_ADDRESS);
    const b = await deriveAtaAddress(OWNER, MINT_NATIVE, TOKEN_PROGRAM_ADDRESS);
    expect(a).toBe(b);
  });

  it("returns a 32-byte base58 address", async () => {
    const ata = await deriveAtaAddress(OWNER, MINT_NATIVE, TOKEN_PROGRAM_ADDRESS);
    const bytes = BASE58_ENCODER.encode(ata);
    expect(bytes.length).toBe(32);
    expect(typeof ata).toBe("string");
    expect((ata as string).length).toBeGreaterThanOrEqual(32);
    expect((ata as string).length).toBeLessThanOrEqual(44);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(ata as string)).toBe(true);
  });

  it("differs across mints for the same owner and token program", async () => {
    const native = await deriveAtaAddress(OWNER, MINT_NATIVE, TOKEN_PROGRAM_ADDRESS);
    const other = await deriveAtaAddress(OWNER, MINT_OTHER, TOKEN_PROGRAM_ADDRESS);
    expect(native).not.toBe(other);
  });
});
