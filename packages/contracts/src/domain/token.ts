import type { Lamports, TokenAmount } from "./amount.js";
import type { MintAddress, OwnerAddress, TokenAccount } from "./pubkey.js";

export interface TokenMetadata {
  readonly mint: MintAddress;
  readonly symbol?: string;
  readonly name?: string;
  readonly decimals: number;
  readonly logoUri?: string;
}

export interface TokenBalance {
  readonly mint: MintAddress;
  readonly owner: OwnerAddress;
  readonly account: TokenAccount;
  readonly amount: TokenAmount;
  readonly decimals: number;
  readonly uiAmount: number;
  readonly metadata?: TokenMetadata;
}

export interface NativeBalance {
  readonly owner: OwnerAddress;
  readonly lamports: Lamports;
}
