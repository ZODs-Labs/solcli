import { type Address, getAddressDecoder } from "@solana/kit";

/**
 * Minimal account info shape returned by an RPC `getAccountInfo` call. The
 * RPC port is intentionally not pulled in as a dep here; an adapter at the
 * call site converts the RPC response.
 */
export interface AccountInfo {
  readonly data: Uint8Array;
  readonly owner: Address;
  readonly lamports: bigint;
  readonly executable: boolean;
  readonly rentEpoch?: bigint;
}

export interface ReadAccountOptions {
  readonly signal: AbortSignal;
}

export interface GetAccountInfoPort {
  read(pubkey: Address, opts: ReadAccountOptions): Promise<AccountInfo | null>;
}

export interface VoteInfo {
  readonly nodePubkey: Address;
  readonly authorizedVoter: Address;
  readonly authorizedWithdrawer: Address;
  readonly commission: number;
}

export interface ReadVoteInfoDeps {
  readonly getAccount: GetAccountInfoPort;
  readonly signal: AbortSignal;
}

const ADDRESS_DECODER = getAddressDecoder();

/**
 * Read a vote account and decode its identity prefix.
 *
 * v0 layout (best effort):
 *   [0..32]  node pubkey
 *   [32..64] authorized voter
 *   [64..96] authorized withdrawer
 *   [96]     commission (u8)
 *
 * The vote account also carries a versioned `VoteState` (epoch credits,
 * timestamp, ...) we do not surface here yet. The 32-byte address slices
 * are decoded with Kit's address codec; no hand-rolled base58.
 */
export async function readVoteInfo(votePubkey: Address, deps: ReadVoteInfoDeps): Promise<VoteInfo> {
  deps.signal.throwIfAborted();
  const info = await deps.getAccount.read(votePubkey, { signal: deps.signal });
  if (info === null) {
    throw new Error(`vote account not found: ${votePubkey}`);
  }
  const buf = info.data;
  if (buf.length < 97) {
    throw new Error(`vote account data too small: expected at least 97 bytes, got ${buf.length}`);
  }
  const commissionByte = buf[96];
  if (commissionByte === undefined) {
    throw new Error("vote account commission byte missing");
  }
  return {
    nodePubkey: ADDRESS_DECODER.decode(buf.subarray(0, 32)),
    authorizedVoter: ADDRESS_DECODER.decode(buf.subarray(32, 64)),
    authorizedWithdrawer: ADDRESS_DECODER.decode(buf.subarray(64, 96)),
    commission: commissionByte,
  };
}
