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
import { getDelegateStakeInstruction, getWithdrawInstruction } from "@solana-program/stake";
import type { SignableTransactionMessage } from "@solcli/contracts";

/**
 * Sysvar account address documented since pre-history. The stake-program
 * instruction defaults `clockSysvar` to this when unset; we set it
 * explicitly so the wire account list always matches the documented order.
 */
const SYSVAR_CLOCK = "SysvarC1ock11111111111111111111111111111111" as Address;
const SYSVAR_STAKE_HISTORY = "SysvarStakeHistory1111111111111111111111111" as Address;
/** Formerly the "stake config" account; the stake program still expects it in the slot. */
const STAKE_LEGACY_UNUSED = "StakeConfig11111111111111111111111111111111" as Address;

export interface BuildDelegateMessageArgs {
  readonly stakeAccount: Address;
  readonly voteAccount: Address;
  readonly authorizedPubkey: Address;
  readonly recentBlockhash: Blockhash;
  readonly lastValidBlockHeight?: bigint;
}

/**
 * Build a v0 transaction message for StakeProgram::DelegateStake using
 * `@solana-program/stake`. The authorized account is wrapped in a noop
 * signer for the build phase; the real signature lands later via
 * `@solcli/signer`.
 */
export function buildDelegateMessage(args: BuildDelegateMessageArgs): SignableTransactionMessage {
  const authority = createNoopSigner(args.authorizedPubkey);
  const ix = getDelegateStakeInstruction({
    stake: args.stakeAccount,
    vote: args.voteAccount,
    clockSysvar: SYSVAR_CLOCK,
    stakeHistory: SYSVAR_STAKE_HISTORY,
    unused: STAKE_LEGACY_UNUSED,
    stakeAuthority: authority,
  });
  return composeMessage({
    payer: args.authorizedPubkey,
    blockhash: args.recentBlockhash,
    lastValidBlockHeight: args.lastValidBlockHeight ?? 0n,
    instruction: ix,
  });
}

export interface BuildWithdrawMessageArgs {
  readonly stakeAccount: Address;
  readonly recipient: Address;
  readonly withdrawAuthority: Address;
  readonly lamports: Lamports;
  readonly recentBlockhash: Blockhash;
  readonly lastValidBlockHeight?: bigint;
}

/** Build a v0 transaction message for StakeProgram::Withdraw. */
export function buildWithdrawMessage(args: BuildWithdrawMessageArgs): SignableTransactionMessage {
  const authority = createNoopSigner(args.withdrawAuthority);
  const ix = getWithdrawInstruction({
    stake: args.stakeAccount,
    recipient: args.recipient,
    clockSysvar: SYSVAR_CLOCK,
    stakeHistory: SYSVAR_STAKE_HISTORY,
    withdrawAuthority: authority,
    args: args.lamports,
  });
  return composeMessage({
    payer: args.withdrawAuthority,
    blockhash: args.recentBlockhash,
    lastValidBlockHeight: args.lastValidBlockHeight ?? 0n,
    instruction: ix,
  });
}

interface ComposeArgs {
  payer: Address;
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
  instruction: Parameters<typeof appendTransactionMessageInstruction>[0];
}

function composeMessage(c: ComposeArgs): SignableTransactionMessage {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(c.payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: c.blockhash, lastValidBlockHeight: c.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstruction(c.instruction, m),
  );
}
