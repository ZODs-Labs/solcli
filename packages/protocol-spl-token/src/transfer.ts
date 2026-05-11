import {
  type Address,
  appendTransactionMessageInstruction,
  type Blockhash,
  createNoopSigner,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferCheckedInstruction } from "@solana-program/token";
import type {
  MintAddress,
  OwnerAddress,
  SignableTransactionMessage,
  TokenAccount,
  TokenAmount,
} from "@solcli/contracts";

export interface BuildTokenTransferMessageArgs {
  readonly owner: OwnerAddress;
  readonly source: TokenAccount;
  readonly destination: TokenAccount;
  readonly mint: MintAddress;
  readonly amount: TokenAmount;
  readonly decimals: number;
  readonly recentBlockhash: Blockhash;
  readonly lastValidBlockHeight?: bigint;
  /**
   * Override the token program address. Defaults to classic SPL Token.
   * Pass the Token-2022 program id to spend a Token-2022 mint.
   */
  readonly tokenProgram?: Address;
}

/**
 * Build a v0 transaction message for SPL Token TransferChecked using
 * `@solana-program/token`. The owner is wrapped in a noop signer; the real
 * signature lands later through `@solcli/signer`.
 */
export function buildTokenTransferMessage(
  args: BuildTokenTransferMessageArgs,
): SignableTransactionMessage {
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > 255) {
    throw new Error(
      `buildTokenTransferMessage: decimals must be a u8 (0..=255), got ${args.decimals}`,
    );
  }

  const authority = createNoopSigner(args.owner);
  const transfer = getTransferCheckedInstruction(
    {
      source: args.source,
      mint: args.mint,
      destination: args.destination,
      authority,
      amount: args.amount,
      decimals: args.decimals,
    },
    args.tokenProgram !== undefined ? { programAddress: args.tokenProgram } : undefined,
  );

  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(args.owner, m),
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
