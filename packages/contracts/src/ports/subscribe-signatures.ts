import type { SignatureFilter, SignatureNotification } from "../domain/transaction.js";
import type { PortCallOptions } from "./common.js";

export interface SubscribeSignaturesPort {
  subscribeSignatures(
    filter: SignatureFilter,
    opts?: PortCallOptions,
  ): AsyncIterable<SignatureNotification>;
}
