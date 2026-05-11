import type { Brand } from "./brand.js";

export type Pubkey = Brand<string, "Pubkey">;
export type MintAddress = Brand<Pubkey, "MintAddress">;
export type OwnerAddress = Brand<Pubkey, "OwnerAddress">;
export type ProgramId = Brand<Pubkey, "ProgramId">;
export type TokenAccount = Brand<Pubkey, "TokenAccount">;
