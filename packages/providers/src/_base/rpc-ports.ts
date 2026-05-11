import type {
  Address,
  GetBalanceApi,
  GetSignaturesForAddressApi,
  GetTokenAccountsByOwnerApi,
  GetTransactionApi,
  Lamports,
  Rpc,
  Signature,
  SimulateTransactionApi,
  Slot,
} from "@solana/kit";
import type {
  GetBalancePort,
  GetTokenBalancesPort,
  GetTransactionHistoryPort,
  GetTransactionPort,
  MintAddress,
  OwnerAddress,
  PortCallOptions,
  SimulateTransactionPort,
  TokenAccount,
  TokenAmount,
  TokenBalance,
  Transaction,
  TransactionStatus,
} from "@solcli/contracts";
import { RpcError } from "@solcli/errors";
import type { PortBindings } from "../manifest.js";
import { encodeMessageAsBase64Wire } from "./encode-message.js";

/**
 * The minimum slice of Kit's RPC API we consume to back the standard ports.
 * Helius and Triton both speak this dialect; vendor-specific extensions
 * (priority-fee estimate, DAS) are layered by each vendor module separately.
 */
export type StandardRpcClient = Rpc<
  GetBalanceApi &
    GetTokenAccountsByOwnerApi &
    SimulateTransactionApi &
    GetTransactionApi &
    GetSignaturesForAddressApi
>;

/**
 * Build the set of port adapters that any standards-compliant Solana RPC can
 * service. Vendor modules call this with their `createSolanaRpc(url)` instance
 * and then layer vendor-specific bindings on top.
 */
export function createStandardRpcPorts(rpc: StandardRpcClient): PortBindings {
  return {
    getBalance: makeGetBalancePort(rpc),
    getTokenBalances: makeGetTokenBalancesPort(rpc),
    simulateTransaction: makeSimulateTransactionPort(rpc),
    getTransaction: makeGetTransactionPort(rpc),
    getTransactionHistory: makeGetTransactionHistoryPort(rpc),
  };
}

function makeGetBalancePort(rpc: StandardRpcClient): GetBalancePort {
  return {
    async getBalance(owner: OwnerAddress, opts?: PortCallOptions): Promise<Lamports> {
      const send = rpc.getBalance(owner as Address);
      const response = await callRpc("getBalance", () =>
        send.send(opts?.signal !== undefined ? { abortSignal: opts.signal } : {}),
      );
      return response.value;
    },
  };
}

function makeGetTokenBalancesPort(rpc: StandardRpcClient): GetTokenBalancesPort {
  return {
    async getTokenBalances(
      owner: OwnerAddress,
      opts?: PortCallOptions,
    ): Promise<readonly TokenBalance[]> {
      const send = rpc.getTokenAccountsByOwner(
        owner as Address,
        { programId: TOKEN_PROGRAM_ADDRESS },
        { encoding: "jsonParsed" },
      );
      const response = await callRpc("getTokenAccountsByOwner", () =>
        send.send(opts?.signal !== undefined ? { abortSignal: opts.signal } : {}),
      );
      const out: TokenBalance[] = [];
      for (const entry of response.value) {
        const info = entry.account.data.parsed.info;
        out.push({
          mint: info.mint as MintAddress,
          owner: info.owner as OwnerAddress,
          account: entry.pubkey as TokenAccount,
          amount: BigInt(info.tokenAmount.amount) as TokenAmount,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        });
      }
      return out;
    },
  };
}

function makeSimulateTransactionPort(rpc: StandardRpcClient): SimulateTransactionPort {
  return {
    async simulate(message, opts) {
      const wire = encodeMessageAsBase64Wire(message);
      const send = rpc.simulateTransaction(wire, {
        commitment: "confirmed",
        encoding: "base64",
        ...(opts.replaceRecentBlockhash === true
          ? { replaceRecentBlockhash: true as const }
          : { sigVerify: opts.sigVerify === true ? (true as const) : (false as const) }),
      });
      const response = await callRpc("simulateTransaction", () =>
        send.send({ abortSignal: opts.signal }),
      );
      const v = response.value;
      const result: {
        ok: boolean;
        logs: readonly string[];
        feeLamports: Lamports;
        err?: string;
        unitsConsumed?: number;
      } = {
        ok: v.err === null,
        logs: v.logs ?? [],
        feeLamports: 0n as Lamports,
      };
      if (v.err !== null) {
        result.err = typeof v.err === "string" ? v.err : JSON.stringify(v.err);
      }
      if (v.unitsConsumed !== undefined) {
        result.unitsConsumed = Number(v.unitsConsumed);
      }
      return result;
    },
  };
}

function makeGetTransactionPort(rpc: StandardRpcClient): GetTransactionPort {
  return {
    async getTransaction(signature: Signature, opts?: PortCallOptions): Promise<Transaction> {
      const send = rpc.getTransaction(signature, {
        commitment: "confirmed",
        encoding: "json",
        maxSupportedTransactionVersion: 0,
      });
      const result = await callRpc("getTransaction", () =>
        send.send(opts?.signal !== undefined ? { abortSignal: opts.signal } : {}),
      );
      if (result === null) {
        throw new RpcError(`Transaction not found: ${signature as unknown as string}`, {
          details: { signature: signature as unknown as string },
        });
      }
      const meta = result.meta;
      const status: TransactionStatus =
        meta?.err === null || meta?.err === undefined ? "success" : "failed";
      const txMessage =
        typeof result.transaction === "object" && result.transaction !== null
          ? (result.transaction as { message: { accountKeys: readonly string[] } }).message
          : { accountKeys: [] };
      return {
        signature,
        meta: {
          fee: (meta?.fee ?? 0n) as Lamports,
          status,
          ...(meta?.err !== undefined && meta?.err !== null
            ? { error: typeof meta.err === "string" ? meta.err : JSON.stringify(meta.err) }
            : {}),
          slot: result.slot as Slot,
          ...(result.blockTime !== null && result.blockTime !== undefined
            ? { blockTime: result.blockTime }
            : {}),
        },
        accounts: (txMessage.accountKeys ?? []) as readonly Address[],
        ...(meta?.logMessages !== undefined && meta.logMessages !== null
          ? { logs: meta.logMessages }
          : {}),
      };
    },
  };
}

function makeGetTransactionHistoryPort(rpc: StandardRpcClient): GetTransactionHistoryPort {
  return {
    async getTransactionHistory(address, page, opts) {
      const send = rpc.getSignaturesForAddress(address as Address, {
        commitment: "confirmed",
        limit: page?.limit ?? 50,
        ...(page?.cursor !== undefined ? { before: page.cursor as Signature } : {}),
      });
      const rows = await callRpc("getSignaturesForAddress", () =>
        send.send(opts?.signal !== undefined ? { abortSignal: opts.signal } : {}),
      );
      const items: Transaction[] = rows.map((row) => ({
        signature: row.signature,
        meta: {
          fee: 0n as Lamports,
          status: (row.err === null ? "success" : "failed") as TransactionStatus,
          slot: row.slot,
          ...(row.blockTime !== null ? { blockTime: row.blockTime } : {}),
          ...(row.err !== null
            ? { error: typeof row.err === "string" ? row.err : JSON.stringify(row.err) }
            : {}),
        },
        accounts: [],
      }));
      const last = rows.at(-1);
      return {
        items,
        ...(last !== undefined ? { nextCursor: last.signature as unknown as string } : {}),
      };
    },
  };
}

/** Classic SPL Token program; the standard ports default to this. */
const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/**
 * Wrap an RPC call so transport-level errors come out as a typed `RpcError`.
 * The caller-provided `name` is part of the error message and details so logs
 * stay grep-able.
 */
async function callRpc<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw cause;
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new RpcError(`RPC ${name} failed: ${message}`, {
      details: { method: name },
      cause: cause instanceof Error ? cause : new Error(String(cause)),
    });
  }
}
