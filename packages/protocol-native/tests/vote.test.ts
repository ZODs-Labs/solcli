import { type Address, getAddressDecoder } from "@solana/kit";
import { describe, expect, it } from "vitest";
import type { AccountInfo, GetAccountInfoPort, ReadAccountOptions } from "../src/vote.js";
import { readVoteInfo } from "../src/vote.js";

const VOTE_PUBKEY = "VotePubkey111111111111111111111111111111111" as Address;
const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
const ADDRESS_DECODER = getAddressDecoder();

function makeFixtureData(): Uint8Array {
  const buf = new Uint8Array(100);
  for (let i = 0; i < 32; i += 1) buf[i] = i + 1;
  for (let i = 0; i < 32; i += 1) buf[32 + i] = i + 33;
  for (let i = 0; i < 32; i += 1) buf[64 + i] = i + 65;
  buf[96] = 7;
  return buf;
}

function makeStubPort(data: Uint8Array | null): GetAccountInfoPort {
  return {
    read: async (_pubkey: Address, opts: ReadAccountOptions): Promise<AccountInfo | null> => {
      opts.signal.throwIfAborted();
      if (data === null) return null;
      return {
        data,
        owner: SYSTEM_PROGRAM,
        lamports: 1n,
        executable: false,
      };
    },
  };
}

describe("readVoteInfo", () => {
  it("extracts node pubkey, authorized voter, authorized withdrawer and commission", async () => {
    const data = makeFixtureData();
    const port = makeStubPort(data);
    const controller = new AbortController();

    const info = await readVoteInfo(VOTE_PUBKEY, {
      getAccount: port,
      signal: controller.signal,
    });

    expect(info.commission).toBe(7);
    expect(info.nodePubkey).toBe(ADDRESS_DECODER.decode(data.subarray(0, 32)));
    expect(info.authorizedVoter).toBe(ADDRESS_DECODER.decode(data.subarray(32, 64)));
    expect(info.authorizedWithdrawer).toBe(ADDRESS_DECODER.decode(data.subarray(64, 96)));
  });

  it("throws when the account is not found", async () => {
    const port = makeStubPort(null);
    const controller = new AbortController();
    await expect(
      readVoteInfo(VOTE_PUBKEY, { getAccount: port, signal: controller.signal }),
    ).rejects.toThrow(/not found/);
  });

  it("throws when the data buffer is too small", async () => {
    const port = makeStubPort(new Uint8Array(50));
    const controller = new AbortController();
    await expect(
      readVoteInfo(VOTE_PUBKEY, { getAccount: port, signal: controller.signal }),
    ).rejects.toThrow(/too small/);
  });

  it("propagates an already aborted signal", async () => {
    const port = makeStubPort(makeFixtureData());
    const controller = new AbortController();
    controller.abort();
    await expect(
      readVoteInfo(VOTE_PUBKEY, { getAccount: port, signal: controller.signal }),
    ).rejects.toBeDefined();
  });
});
