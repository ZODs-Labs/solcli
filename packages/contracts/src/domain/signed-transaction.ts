import type { Pubkey } from "./pubkey.js";
import type { Signature } from "./signature.js";

export interface TransactionSignature {
  readonly signer: Pubkey;
  readonly signature: Signature;
}

export interface SignedTransaction {
  readonly version: 0;
  readonly payer: Pubkey;
  readonly serializedMessage: Uint8Array;
  readonly signatures: readonly TransactionSignature[];
}
