import type { Lamports } from "../domain/amount.js";
import type { OwnerAddress } from "../domain/pubkey.js";
import type { PortCallOptions } from "./common.js";

export interface GetBalancePort {
  getBalance(owner: OwnerAddress, opts?: PortCallOptions): Promise<Lamports>;
}
