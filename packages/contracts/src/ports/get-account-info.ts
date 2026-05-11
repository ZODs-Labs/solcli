import type { Lamports } from "@solana/kit";
import type { Pubkey } from "../domain/pubkey.js";
import type { PortCallOptions } from "./common.js";

export interface AccountInfo {
  /** The account's owning program (a base58 pubkey). */
  readonly owner: Pubkey;
  /** Lamports balance. */
  readonly lamports: Lamports;
  /** Raw account data, base64-decoded into bytes. May be empty. */
  readonly data: Uint8Array;
  /** Whether the account is a deployed executable program. */
  readonly executable: boolean;
  /** The epoch at which the account next owes rent. */
  readonly rentEpoch?: bigint;
}

export interface GetAccountInfoPort {
  /**
   * Fetch the on-chain account at the given address. Returns `null` when
   * the address is unknown to the cluster (the account does not exist).
   */
  getAccountInfo(address: Pubkey, opts?: PortCallOptions): Promise<AccountInfo | null>;
}
