import type {
  GetTokenBalancesPort,
  MintAddress,
  OwnerAddress,
  PortCallOptions,
  TokenAccount,
  TokenAmount,
  TokenBalance,
} from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { getTokenBalance } from "../src/balance.js";

const OWNER = "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde" as OwnerAddress;
const MINT_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as MintAddress;
const MINT_BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" as MintAddress;
const USDC_ACCOUNT = "TokAcct1111111111111111111111111111111111111" as TokenAccount;
const BONK_ACCOUNT = "TokAcct2222222222222222222222222222222222222" as TokenAccount;

function stubPort(balances: readonly TokenBalance[]): {
  port: GetTokenBalancesPort;
  calls: Array<{ owner: OwnerAddress; opts?: PortCallOptions }>;
} {
  const calls: Array<{ owner: OwnerAddress; opts?: PortCallOptions }> = [];
  const port: GetTokenBalancesPort = {
    async getTokenBalances(owner, opts) {
      calls.push({ owner, ...(opts !== undefined ? { opts } : {}) });
      return balances;
    },
  };
  return { port, calls };
}

describe("getTokenBalance", () => {
  it("returns the matching mint amount", async () => {
    const balances: readonly TokenBalance[] = [
      {
        mint: MINT_BONK,
        owner: OWNER,
        account: BONK_ACCOUNT,
        amount: 9_000n as TokenAmount,
        decimals: 5,
        uiAmount: 0.09,
      },
      {
        mint: MINT_USDC,
        owner: OWNER,
        account: USDC_ACCOUNT,
        amount: 1_234_567n as TokenAmount,
        decimals: 6,
        uiAmount: 1.234567,
      },
    ];
    const { port, calls } = stubPort(balances);
    const ctrl = new AbortController();

    const amount = await getTokenBalance(
      { owner: OWNER, mint: MINT_USDC, signal: ctrl.signal },
      { getTokenBalances: port },
    );

    expect(amount).toBe(1_234_567n);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.owner).toBe(OWNER);
    expect(calls[0]?.opts?.signal).toBe(ctrl.signal);
  });

  it("returns 0n when the owner has no balance for the mint", async () => {
    const { port } = stubPort([]);
    const ctrl = new AbortController();

    const amount = await getTokenBalance(
      { owner: OWNER, mint: MINT_USDC, signal: ctrl.signal },
      { getTokenBalances: port },
    );

    expect(amount).toBe(0n);
  });

  it("returns 0n when the list omits the requested mint", async () => {
    const balances: readonly TokenBalance[] = [
      {
        mint: MINT_BONK,
        owner: OWNER,
        account: BONK_ACCOUNT,
        amount: 9_000n as TokenAmount,
        decimals: 5,
        uiAmount: 0.09,
      },
    ];
    const { port } = stubPort(balances);
    const ctrl = new AbortController();

    const amount = await getTokenBalance(
      { owner: OWNER, mint: MINT_USDC, signal: ctrl.signal },
      { getTokenBalances: port },
    );

    expect(amount).toBe(0n);
  });

  it("throws if the signal is already aborted", async () => {
    const { port } = stubPort([]);
    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      getTokenBalance(
        { owner: OWNER, mint: MINT_USDC, signal: ctrl.signal },
        { getTokenBalances: port },
      ),
    ).rejects.toThrow();
  });
});
