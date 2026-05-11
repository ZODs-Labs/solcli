import type { Signature } from "../domain/signature.js";
import type { Transaction } from "../domain/transaction.js";
import type { PortCallOptions } from "./common.js";

export interface GetTransactionPort {
  getTransaction(signature: Signature, opts?: PortCallOptions): Promise<Transaction>;
}
