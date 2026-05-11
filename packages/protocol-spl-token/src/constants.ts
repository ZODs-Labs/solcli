import type { Pubkey } from "@solcli/contracts";

/**
 * SPL Token and Associated Token Account program addresses.
 *
 * Declared locally so the package compiles without pulling a Solana SDK.
 * Each literal is the canonical base58 program address.
 */
export const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Pubkey;
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Pubkey;
export const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Pubkey;
