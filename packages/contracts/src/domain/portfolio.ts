import type { OwnerAddress } from "./pubkey.js";
import type { NativeBalance, TokenBalance } from "./token.js";

export interface Portfolio {
  readonly owner: OwnerAddress;
  readonly native: NativeBalance;
  readonly tokens: readonly TokenBalance[];
  readonly nftCount?: number;
  readonly totalUsdValue?: number;
}
