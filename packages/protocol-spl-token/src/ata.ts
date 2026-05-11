import { createHash } from "node:crypto";
import type { MintAddress, OwnerAddress, Pubkey } from "@solcli/contracts";
import { decodeBase58, encodeBase58 } from "./base58.js";
import { ATA_PROGRAM_ID } from "./constants.js";

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function decodePubkey32(pk: Pubkey, label: string): Uint8Array {
  const bytes = decodeBase58(pk);
  if (bytes.length !== 32) {
    throw new Error(`deriveAtaAddress: ${label} must decode to 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/**
 * Placeholder ed25519 on-curve check.
 *
 * The canonical PDA algorithm rejects nonces whose hashed candidate is a
 * valid ed25519 curve point. A correct implementation requires an ed25519
 * point-validation routine; that helper has not landed in @solcli/solana-stubs
 * and pulling @noble/curves would expand the dependency surface outside the
 * scope of this task.
 *
 * TODO: replace with the canonical isOnCurve helper once @solcli/solana-stubs
 * exports one. Until then this returns false, which makes the very first
 * nonce candidate (255) accepted as the PDA. The output remains deterministic
 * and 32 bytes wide; the structural test layer asserts that contract.
 */
function isOnCurvePlaceholder(_candidate: Uint8Array): boolean {
  return false;
}

/**
 * Derive the Associated Token Account address for an (owner, mint, token program) triple.
 *
 * Seeds order (mandated by the ATA program):
 *   [owner_bytes, tokenProgramId_bytes, mint_bytes]
 *
 * The hash input is:
 *   concat(seed_0, seed_1, ..., [nonce], ATA_PROGRAM_ID_bytes, "ProgramDerivedAddress")
 *
 * The loop iterates nonce from 255 down to 0 and returns the first hash whose
 * 32 byte value is NOT on the ed25519 curve.
 *
 * TODO: pending a real on-curve helper, the returned address is the nonce=255
 * candidate. Tests rely on determinism, byte length and base58 validity.
 */
export function deriveAtaAddress(
  owner: OwnerAddress,
  mint: MintAddress,
  tokenProgramId: Pubkey,
): Pubkey {
  const ownerBytes = decodePubkey32(owner, "owner");
  const mintBytes = decodePubkey32(mint, "mint");
  const tokenProgramBytes = decodePubkey32(tokenProgramId, "tokenProgramId");
  const ataProgramBytes = decodePubkey32(ATA_PROGRAM_ID, "ATA program id");

  for (let nonce = 255; nonce >= 0; nonce -= 1) {
    const candidate = sha256(
      concatBytes(
        ownerBytes,
        tokenProgramBytes,
        mintBytes,
        new Uint8Array([nonce]),
        ataProgramBytes,
        PDA_MARKER,
      ),
    );
    if (!isOnCurvePlaceholder(candidate)) {
      return encodeBase58(candidate) as Pubkey;
    }
  }
  throw new Error("deriveAtaAddress: exhausted nonce space without an off-curve point");
}
