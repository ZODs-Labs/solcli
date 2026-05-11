import type { Pubkey } from "../domain/pubkey.js";
import type { SignableTransactionMessage } from "../domain/tx-plan.js";

export interface ProposeMultisigTxOptions {
  readonly signal: AbortSignal;
  readonly multisig: Pubkey;
  readonly vault: Pubkey;
}

export interface ProposeMultisigTxResult {
  readonly proposalAddress: Pubkey;
  readonly transactionIndex: bigint;
}

export interface ProposeMultisigTxPort {
  propose(
    message: SignableTransactionMessage,
    opts: ProposeMultisigTxOptions,
  ): Promise<ProposeMultisigTxResult>;
}
