import type { PaginatedResult, PaginationCursor } from "../domain/pagination.js";
import type { Pubkey } from "../domain/pubkey.js";
import type { Transaction } from "../domain/transaction.js";
import type { PortCallOptions } from "./common.js";

export interface GetTransactionHistoryPort {
  getTransactionHistory(
    address: Pubkey,
    page?: PaginationCursor,
    opts?: PortCallOptions,
  ): Promise<PaginatedResult<Transaction>>;
}
