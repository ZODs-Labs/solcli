import { type Base64EncodedWireTransaction, getBase58Encoder, getBase64Decoder } from "@solana/kit";
import type {
  EmitEventPort,
  FeePolicy,
  GetPriorityFeePolicyOptions,
  GetPriorityFeePolicyPort,
  Lamports,
  SignableTransactionMessage,
  Signature,
  SignedTransaction,
  SignTransactionPort,
  SimulateTransactionPort,
} from "@solcli/contracts";
import { RpcError } from "@solcli/errors";
import {
  createConfirmSignatureFn,
  type HeliusProviderInstance,
  type StandardRpcClient,
  type StandardRpcSubscriptionsClient,
  type TritonProviderInstance,
} from "@solcli/providers";
import type { SignerAlias, SignerRegistry, SignTransactionOptions } from "@solcli/signer";
import {
  type BlockhashRefreshResult,
  type ConfirmResult,
  createTransactionService,
  type TransactionService,
  type TransactionServiceDeps,
  type TxCache,
  type TxLogger,
} from "@solcli/tx";

export interface KitTxBackedProvider {
  readonly rpc: StandardRpcClient;
  readonly rpcSubscriptions: StandardRpcSubscriptionsClient;
}

export interface CreateTxServiceDeps {
  readonly provider: KitTxBackedProvider;
  readonly signers: SignerRegistry;
  readonly simulate: SimulateTransactionPort;
  readonly cache: TxCache;
  readonly logger: TxLogger;
  readonly events?: EmitEventPort;
  readonly newRequestId?: () => string;
  /** Optional fee port; not all providers ship one. Defaults to a no-op. */
  readonly fee?: GetPriorityFeePolicyPort;
}

/**
 * Wire a `TransactionService` against a Kit provider + signer registry.
 * The service runs the full state-changing pipeline: safety → simulate →
 * fee → intent → sign → send → confirm. Send goes through `rpc.sendTransaction`;
 * confirm subscribes to the cluster's signatureNotifications websocket via
 * `createConfirmSignatureFn`.
 */
export function createKitTransactionService(deps: CreateTxServiceDeps): TransactionService {
  const { provider, signers } = deps;
  const fee = deps.fee ?? noopFeePort();
  const sign: SignTransactionPort = {
    async sign(
      alias: SignerAlias,
      message: SignableTransactionMessage,
      opts: SignTransactionOptions,
    ) {
      const adapter = await signers.get(alias, { signal: opts.signal });
      return adapter.sign(alias, message, opts);
    },
  };

  const wired: TransactionServiceDeps = {
    simulate: deps.simulate,
    fee,
    sign,
    cache: deps.cache,
    clock: () => Date.now(),
    logger: deps.logger,
    sendRawTransaction: makeSendRawTransaction(provider.rpc),
    confirmSignature: makeConfirmSignature(provider),
    refreshBlockhash: makeRefreshBlockhash(provider.rpc),
    ...(deps.events !== undefined ? { events: deps.events } : {}),
    ...(deps.newRequestId !== undefined ? { newRequestId: deps.newRequestId } : {}),
  };
  return createTransactionService(wired);
}

const BASE58_ENCODER = getBase58Encoder();
const BASE64_DECODER = getBase64Decoder();

/**
 * Encode a `SignedTransaction` into the base64 wire bytes that
 * `rpc.sendTransaction` accepts. The signed message bytes are prefixed with
 * the standard `[u8 sigCount][sig × N]` envelope.
 */
function encodeSignedTxAsBase64Wire(signed: SignedTransaction): Base64EncodedWireTransaction {
  const sigs: Uint8Array[] = [];
  for (const ts of signed.signatures) {
    const decoded = BASE58_ENCODER.encode(ts.signature as unknown as string);
    if (decoded.length !== 64) {
      throw new RpcError(
        `sendRawTransaction: signature for ${String(ts.signer)} is ${decoded.length} bytes, expected 64`,
      );
    }
    sigs.push(new Uint8Array(decoded));
  }
  // shortvec-encode the signature count. For N < 128 a single byte suffices.
  if (sigs.length >= 128) {
    throw new RpcError(
      `sendRawTransaction: ${sigs.length} signatures exceeds the 127 shortvec limit`,
    );
  }
  const out = new Uint8Array(1 + sigs.length * 64 + signed.serializedMessage.length);
  out[0] = sigs.length;
  let offset = 1;
  for (const sig of sigs) {
    out.set(sig, offset);
    offset += 64;
  }
  out.set(signed.serializedMessage, offset);
  return BASE64_DECODER.decode(out) as Base64EncodedWireTransaction;
}

function makeSendRawTransaction(
  rpc: StandardRpcClient,
): (signed: SignedTransaction, opts: { signal: AbortSignal }) => Promise<Signature> {
  return async (signed, opts) => {
    const wire = encodeSignedTxAsBase64Wire(signed);
    // Kit's send/getTransaction RPC types are split; we cast through the
    // standard slice here to keep this wiring file self-contained.
    const rpcWithSend = rpc as unknown as {
      sendTransaction(
        wire: Base64EncodedWireTransaction,
        config: { encoding: "base64"; skipPreflight?: boolean; maxRetries?: bigint },
      ): { send(opts?: { abortSignal?: AbortSignal }): Promise<Signature> };
    };
    const pending = rpcWithSend.sendTransaction(wire, { encoding: "base64" });
    try {
      return await pending.send({ abortSignal: opts.signal });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new RpcError(`sendTransaction failed: ${message}`, {
        details: { method: "sendTransaction" },
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  };
}

function makeConfirmSignature(
  provider: KitTxBackedProvider,
): (sig: Signature, opts: { signal: AbortSignal }) => Promise<ConfirmResult> {
  const fn = createConfirmSignatureFn({
    rpc: provider.rpc as unknown as Parameters<typeof createConfirmSignatureFn>[0]["rpc"],
    rpcSubscriptions: provider.rpcSubscriptions,
    commitment: "confirmed",
  });
  return async (sig, opts) => {
    const out = await fn(sig, opts);
    const result: ConfirmResult = {
      slot: out.slot,
      confirmationStatus: out.confirmationStatus,
      ...(out.err !== undefined ? { err: out.err } : {}),
    };
    return result;
  };
}

function makeRefreshBlockhash(
  rpc: StandardRpcClient,
): (opts: { signal: AbortSignal }) => Promise<BlockhashRefreshResult> {
  return async (opts) => {
    const rpcWithLatest = rpc as unknown as {
      getLatestBlockhash(config?: { commitment?: "confirmed" }): {
        send(opts?: {
          abortSignal?: AbortSignal;
        }): Promise<{ value: { blockhash: string; lastValidBlockHeight: bigint } }>;
      };
    };
    const pending = rpcWithLatest.getLatestBlockhash({ commitment: "confirmed" });
    try {
      const response = await pending.send({ abortSignal: opts.signal });
      return {
        blockhash: response.value.blockhash,
        lastValidBlockHeight: response.value.lastValidBlockHeight,
      };
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new RpcError(`getLatestBlockhash failed: ${message}`, {
        details: { method: "getLatestBlockhash" },
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  };
}

function noopFeePort(): GetPriorityFeePolicyPort {
  return {
    async recommend(
      _message: SignableTransactionMessage,
      _opts: GetPriorityFeePolicyOptions,
    ): Promise<bigint> {
      return 0n;
    },
  };
}

/** Narrow a generic `ProviderInstance` to one that carries Kit primitives. */
export function asKitTxBackedProvider(
  p: unknown,
): (HeliusProviderInstance | TritonProviderInstance) | null {
  if (typeof p !== "object" || p === null) return null;
  const candidate = p as { rpc?: unknown; rpcSubscriptions?: unknown };
  if (candidate.rpc !== undefined && candidate.rpcSubscriptions !== undefined) {
    return p as HeliusProviderInstance | TritonProviderInstance;
  }
  return null;
}

/**
 * `Lamports` is exported by Kit as a branded bigint; we re-surface it here
 * so other wiring modules can refer to it without an extra import.
 */
export type { FeePolicy, Lamports };
