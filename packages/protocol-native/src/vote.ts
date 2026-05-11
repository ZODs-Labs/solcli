import type { Pubkey } from "@solcli/contracts";
import { encodeBase58 } from "./base58.js";

/**
 * Minimal account info shape returned by an RPC getAccountInfo call.
 */
export interface AccountInfo {
  readonly data: Uint8Array;
  readonly owner: Pubkey;
  readonly lamports: bigint;
  readonly executable: boolean;
  readonly rentEpoch?: bigint;
}

export interface ReadAccountOptions {
  readonly signal: AbortSignal;
}

/**
 * Local port shape for fetching a single account.
 *
 * This is defined inside the protocol package so the package compiles
 * without touching the contracts surface. The downstream wiring will
 * adapt the real RpcClient to this shape.
 *
 * TODO: promote to a shared contracts port once the v1 RPC flow lands.
 */
export interface GetAccountInfoPort {
  read(pubkey: Pubkey, opts: ReadAccountOptions): Promise<AccountInfo | null>;
}

export interface VoteInfo {
  readonly nodePubkey: Pubkey;
  readonly authorizedVoter: Pubkey;
  readonly authorizedWithdrawer: Pubkey;
  readonly commission: number;
}

export interface ReadVoteInfoDeps {
  readonly getAccount: GetAccountInfoPort;
  readonly signal: AbortSignal;
}

/**
 * Read a vote account and decode its identity fields.
 *
 * v0 layout (best effort):
 *   [0..32]  node pubkey
 *   [32..64] authorized voter
 *   [64..96] authorized withdrawer
 *   [96]     commission (u8)
 *
 * TODO: the real vote account uses a richer bincode layout (versioned
 * VoteState with epoch credits, last timestamp etc.). v1 should swap this
 * naive slice for a full borsh or bincode parser delivered through the
 * shared solana stubs package.
 */
export async function readVoteInfo(votePubkey: Pubkey, deps: ReadVoteInfoDeps): Promise<VoteInfo> {
  deps.signal.throwIfAborted();
  const info = await deps.getAccount.read(votePubkey, { signal: deps.signal });
  if (info === null) {
    throw new Error(`vote account not found: ${votePubkey}`);
  }
  const buf = info.data;
  if (buf.length < 97) {
    throw new Error(`vote account data too small: expected at least 97 bytes, got ${buf.length}`);
  }
  const nodePubkey = encodeBase58(buf.subarray(0, 32)) as Pubkey;
  const authorizedVoter = encodeBase58(buf.subarray(32, 64)) as Pubkey;
  const authorizedWithdrawer = encodeBase58(buf.subarray(64, 96)) as Pubkey;
  const commissionByte = buf[96];
  if (commissionByte === undefined) {
    throw new Error("vote account commission byte missing");
  }
  return {
    nodePubkey,
    authorizedVoter,
    authorizedWithdrawer,
    commission: commissionByte,
  };
}
