import {
  type Address,
  appendTransactionMessageInstruction,
  type Blockhash,
  createNoopSigner,
  createTransactionMessage,
  type Lamports,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import type { SignableTransactionMessage } from "@solcli/contracts";

export interface BuildTransferMessageArgs {
  readonly from: Address;
  readonly to: Address;
  readonly lamports: Lamports;
  readonly recentBlockhash: Blockhash;
  /** Block height after which the blockhash is considered too old to land. */
  readonly lastValidBlockHeight?: bigint;
}

/**
 * Build a fully-formed Solana v0 transaction message for a SystemProgram
 * transfer. Delegates the instruction encoding to `@solana-program/system`
 * and composes the message with Kit's transaction-message helpers.
 *
 * The source account is wrapped in a noop signer; the real signing happens
 * later through `@solcli/signer` (or whatever signer adapter is configured)
 * which already knows the keypair for `args.from`.
 */
export function buildTransferMessage(args: BuildTransferMessageArgs): SignableTransactionMessage {
  const source = createNoopSigner(args.from);
  const transfer = getTransferSolInstruction({
    source,
    destination: args.to,
    amount: args.lamports,
  });

  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(args.from, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: args.recentBlockhash,
          lastValidBlockHeight: args.lastValidBlockHeight ?? 0n,
        },
        m,
      ),
    (m) => appendTransactionMessageInstruction(transfer, m),
  );
}
