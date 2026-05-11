import type { Address } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { MintAddress, OwnerAddress, TokenAccount } from "@solcli/contracts";

/**
 * Derive the Associated Token Account address for an (owner, mint, token
 * program) triple. Delegates to `findAssociatedTokenPda` from
 * `@solana-program/token`, which uses the canonical on-curve check Kit
 * ships with `@solana/addresses` so we do not maintain our own.
 */
export async function deriveAtaAddress(
  owner: OwnerAddress,
  mint: MintAddress,
  tokenProgramId: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<TokenAccount> {
  const [pda] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: tokenProgramId,
  });
  return pda;
}

/** Convenience: the classic SPL Token program address re-exported. */
export const SPL_TOKEN_PROGRAM_ADDRESS = TOKEN_PROGRAM_ADDRESS;

/** Convenience: the Token-2022 program address re-exported. */
export { TOKEN_2022_PROGRAM_ADDRESS };
