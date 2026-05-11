import type { OwnerAddress } from "../domain/pubkey.js";
import type { TokenBalance } from "../domain/token.js";
import type { PortCallOptions } from "./common.js";

export interface GetTokenBalancesPort {
  getTokenBalances(owner: OwnerAddress, opts?: PortCallOptions): Promise<readonly TokenBalance[]>;
}
