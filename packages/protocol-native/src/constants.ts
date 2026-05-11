import type { Pubkey } from "@solcli/contracts";

/**
 * Solana program and sysvar addresses used by native protocols.
 * Cast at the boundary; these literal values are validated base58 by construction
 * (32 to 44 chars in the base58 alphabet) and only enter the domain here.
 */
export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Pubkey;
export const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111" as Pubkey;
export const VOTE_PROGRAM = "Vote111111111111111111111111111111111111111" as Pubkey;
export const SYSVAR_CLOCK = "SysvarC1ock11111111111111111111111111111111" as Pubkey;
export const SYSVAR_STAKE_HISTORY = "SysvarStakeHistory1111111111111111111111111" as Pubkey;
export const STAKE_CONFIG = "StakeConfig11111111111111111111111111111111" as Pubkey;
