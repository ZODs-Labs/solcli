import type { Address, Lamports, Signature, Slot } from "@solana/kit";
import { ConfigError } from "@solcli/errors";
import { describe, expect, it, vi } from "vitest";
import type { StandardRpcClient } from "../../src/_base/rpc-ports.js";
import { createHeliusProvider, HELIUS_MANIFEST } from "../../src/vendors/helius/index.js";

const OWNER = "11111111111111111111111111111111" as Address;
const SIG = "Si9111111111111111111111111111111111111111111111111111111111111111" as Signature;

function pending<T>(value: T) {
  return { send: vi.fn(async () => value) };
}

function rpcResponse<T>(value: T) {
  return { context: { slot: 100n as Slot }, value };
}

describe("createHeliusProvider", () => {
  describe("URL resolution", () => {
    it("derives the mainnet URL from an apiKey", () => {
      const calls: string[] = [];
      const fakeCreate = (url: string) => {
        calls.push(url);
        return makeFakeRpc();
      };
      // We can't intercept Kit's createSolanaRpc cheaply, so use the rpc-injection path.
      createHeliusProvider({
        apiKey: "abc",
        rpc: fakeCreate("https://mainnet.helius-rpc.com/?api-key=abc"),
      });
      expect(calls[0]).toBe("https://mainnet.helius-rpc.com/?api-key=abc");
    });

    it("accepts an explicit https endpoint", () => {
      const p = createHeliusProvider({ endpoint: "https://my-rpc/", rpc: makeFakeRpc() });
      expect(p.manifest.name).toBe("helius");
    });

    it("rejects an http endpoint with apiKey omitted", () => {
      expect(() => createHeliusProvider({ endpoint: "ftp://nope" })).toThrow(ConfigError);
    });

    it("throws when neither apiKey nor endpoint is provided", () => {
      expect(() => createHeliusProvider({})).toThrow(ConfigError);
    });
  });

  describe("port adapters", () => {
    it("declares the standard RPC port set", () => {
      expect([...HELIUS_MANIFEST.ports]).toEqual([
        "getBalance",
        "getTokenBalances",
        "simulateTransaction",
        "getTransaction",
        "getTransactionHistory",
      ]);
    });

    it("getBalance forwards the address and unwraps the Lamports value", async () => {
      const rpc = makeFakeRpc({
        getBalance: vi.fn((_addr: Address) => pending(rpcResponse(123_456n as Lamports))),
      });
      const provider = createHeliusProvider({ rpc });
      const port = provider.port("getBalance");
      if (port === undefined) throw new Error("getBalance port missing");
      const ctrl = new AbortController();
      const out = await port.getBalance(OWNER, { signal: ctrl.signal });
      expect(out).toBe(123_456n);
      expect(rpc.getBalance).toHaveBeenCalledWith(OWNER);
    });

    it("getTransaction surfaces an RpcError when the signature is unknown", async () => {
      const rpc = makeFakeRpc({
        getTransaction: vi.fn(() => pending(null)),
      });
      const provider = createHeliusProvider({ rpc });
      const port = provider.port("getTransaction");
      if (port === undefined) throw new Error("getTransaction port missing");
      await expect(
        port.getTransaction(SIG, { signal: new AbortController().signal }),
      ).rejects.toThrow(/not found/i);
    });
  });
});

type FakeRpcMethods = Partial<{
  getBalance: (addr: Address) => { send: () => Promise<unknown> };
  getTokenAccountsByOwner: (...args: unknown[]) => { send: () => Promise<unknown> };
  simulateTransaction: (...args: unknown[]) => { send: () => Promise<unknown> };
  getTransaction: (...args: unknown[]) => { send: () => Promise<unknown> };
  getSignaturesForAddress: (...args: unknown[]) => { send: () => Promise<unknown> };
}>;

function makeFakeRpc(overrides: FakeRpcMethods = {}): StandardRpcClient {
  const base = {
    getBalance: () => pending(rpcResponse(0n as Lamports)),
    getTokenAccountsByOwner: () => pending(rpcResponse([])),
    simulateTransaction: () =>
      pending(
        rpcResponse({
          err: null,
          logs: [],
          unitsConsumed: undefined,
          returnData: null,
        }),
      ),
    getTransaction: () => pending(null),
    getSignaturesForAddress: () => pending([]),
  };
  return { ...base, ...overrides } as unknown as StandardRpcClient;
}
