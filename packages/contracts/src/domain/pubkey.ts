import type { Address } from "@solana/kit";

/**
 * A Solana public key (32 bytes, base58-encoded). This is Kit's `Address`
 * re-exported under the same name so domain code reads naturally and there
 * is no parallel brand layer.
 */
export type Pubkey = Address;

/**
 * Domain refinements: each is a Solana address used in a specific role.
 * No nominal distinction is enforced; the parameter name carries the role.
 */
export type MintAddress = Address;
export type OwnerAddress = Address;
export type ProgramId = Address;
export type TokenAccount = Address;
