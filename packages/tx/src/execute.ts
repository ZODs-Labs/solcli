import type {
  Blockhash,
  FeePolicy,
  IntentEnvelope,
  Lamports,
  Result,
  SignableTransactionMessage,
  Signature,
  SignedTransaction,
  SignerAlias,
} from "@solcli/contracts";
import {
  RpcRateLimitError,
  SafetyBudgetExceededError,
  SafetyIntentRequiredError,
  TxBlockhashExpiredV2Error,
  TxSimulateFailedError,
} from "@solcli/errors";
import { emitRecord } from "./events.js";
import { withIdempotency } from "./idempotency.js";
import { buildIntent, lamportsDeltaForPayer } from "./intent.js";
import { withRetries } from "./retries.js";
import type {
  ExecuteOptionsExtended,
  SimulateFirstVerdict,
  TransactionServiceDeps,
} from "./service.js";
import { runConfirm } from "./stages/confirm.js";
import { estimateFee } from "./stages/fee.js";
import { runSend } from "./stages/send.js";
import { runSign } from "./stages/sign.js";
import { runSimulate } from "./stages/simulate.js";

const MAX_SEND_ATTEMPTS = 3;

export async function runExecute(
  deps: TransactionServiceDeps,
  initialPlan: SignableTransactionMessage,
  opts: ExecuteOptionsExtended,
  alias: SignerAlias,
  feePolicy: FeePolicy,
): Promise<Result<Signature, unknown>> {
  const requestId = deps.newRequestId?.() ?? cryptoRequestId(deps.clock);
  const ctx = { events: deps.events, clock: deps.clock, requestId };

  return withIdempotency(
    opts.idempotencyKey,
    () => runExecuteOnce(deps, initialPlan, opts, alias, feePolicy, ctx),
    deps.cache,
    (v) => serializeResult(v),
    (raw) => deserializeResult(raw),
  );
}

interface EventCtx {
  readonly events: TransactionServiceDeps["events"];
  readonly clock: () => number;
  readonly requestId: string;
}

async function runExecuteOnce(
  deps: TransactionServiceDeps,
  initialPlan: SignableTransactionMessage,
  opts: ExecuteOptionsExtended,
  alias: SignerAlias,
  feePolicy: FeePolicy,
  ctx: EventCtx,
): Promise<Result<Signature, unknown>> {
  let plan: SignableTransactionMessage = initialPlan;

  opts.signal.throwIfAborted();
  emitRecord(ctx, "tx.build", {});

  const simulateFirst = (deps.evaluateSimulateFirst ?? defaultSimulateFirstGate)({
    execute: opts.execute ?? false,
  });
  if (!simulateFirst.ok) {
    const err = new SafetyIntentRequiredError(
      simulateFirst.reason ?? "Pass --execute to authorize a write-path call",
    );
    emitRecord(ctx, "safety.gate.rejected", {
      code: simulateFirst.code ?? err.code,
      reason: simulateFirst.reason ?? err.message,
    });
    emitRecord(ctx, "tx.failed", { code: err.code, message: err.message });
    return { ok: false, error: err };
  }

  // Stage 2: simulate.
  const simulation = await runSimulate(plan, { simulate: deps.simulate, signal: opts.signal });
  emitRecord(ctx, "tx.simulate", {
    ok: simulation.ok,
    unitsConsumed: simulation.unitsConsumed,
    feeLamports: simulation.feeLamports.toString(),
  });
  if (!simulation.ok) {
    const err = new TxSimulateFailedError(simulation.err ?? "Simulation reported failure", {
      details: { logs: simulation.logs },
    });
    emitRecord(ctx, "tx.failed", { code: err.code, message: err.message });
    return { ok: false, error: err };
  }

  // Stage 3: fee.
  const recommendedMicroLamportsPerCu = await estimateFee(plan, simulation, {
    fee: deps.fee,
    signal: opts.signal,
    policy: feePolicy,
  });
  emitRecord(ctx, "tx.fee.estimated", {
    recommendedMicroLamportsPerCu: recommendedMicroLamportsPerCu.toString(),
    policy: feePolicy.kind,
  });

  // Cost budget gate.
  const delta = lamportsDeltaForPayer(plan, simulation);
  const totalOutflow = delta + simulation.feeLamports;
  if (totalOutflow > opts.costBudgetLamports) {
    const err = new SafetyBudgetExceededError(
      `Estimated outflow ${totalOutflow.toString()} exceeds budget ${opts.costBudgetLamports.toString()}`,
    );
    emitRecord(ctx, "safety.gate.rejected", { code: err.code, reason: err.message });
    emitRecord(ctx, "tx.failed", { code: err.code, message: err.message });
    return { ok: false, error: err };
  }

  // Intent envelope.
  const intent: IntentEnvelope = buildIntent(plan, simulation, {
    summary: "write-intent",
    idempotencyKey: opts.idempotencyKey,
    costBudgetLamports: opts.costBudgetLamports as Lamports,
    signerAlias: alias as unknown as string,
  });
  emitRecord(ctx, "intent.emitted", intent);

  // Stage 4 + 5: sign and send, with blockhash refresh up to 3 attempts.
  let signed: SignedTransaction = await runSign(alias, plan, {
    sign: deps.sign,
    signal: opts.signal,
    intent,
  });
  emitRecord(ctx, "tx.signed", { signatures: signed.signatures.map((s) => s.signature) });

  const via = opts.via ?? "rpc";
  let signature: Signature | undefined;

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    opts.signal.throwIfAborted();
    try {
      signature = await withRetries(
        () =>
          runSend(
            signed,
            {
              sendRawTransaction: deps.sendRawTransaction,
              bundle: deps.bundle,
              signal: opts.signal,
              tipAccount: undefined,
              tipLamports:
                feePolicy.kind === "jito" ? (feePolicy.tipLamports as Lamports) : undefined,
            },
            via,
          ),
        {
          signal: opts.signal,
          maxAttempts: 3,
          baseMs: 200,
          capMs: 2000,
          retryOn: (err) => err instanceof RpcRateLimitError,
        },
      );
      emitRecord(ctx, "tx.sent", { signature });
      break;
    } catch (err: unknown) {
      if (isAbortError(err)) throw err;
      if (!(err instanceof TxBlockhashExpiredV2Error)) {
        emitRecord(ctx, "tx.failed", {
          code:
            err instanceof Error
              ? ((err as { code?: string }).code ?? "SOLCLI_E_GENERIC")
              : "SOLCLI_E_GENERIC",
          message: err instanceof Error ? err.message : String(err),
        });
        return { ok: false, error: err };
      }
      if (attempt === MAX_SEND_ATTEMPTS) {
        emitRecord(ctx, "tx.failed", { code: err.code, message: err.message, attempts: attempt });
        return { ok: false, error: err };
      }
      const refresh = await deps.refreshBlockhash({ signal: opts.signal });
      deps.logger.debug({ attempt, blockhash: refresh.blockhash }, "tx blockhash refreshed");
      plan = {
        ...plan,
        lifetimeConstraint: {
          blockhash: refresh.blockhash as Blockhash,
          lastValidBlockHeight: plan.lifetimeConstraint.lastValidBlockHeight,
        },
      };
      signed = await runSign(alias, plan, {
        sign: deps.sign,
        signal: opts.signal,
        intent,
      });
    }
  }

  if (signature === undefined) {
    const err = new TxBlockhashExpiredV2Error("Exhausted send attempts without a signature");
    emitRecord(ctx, "tx.failed", { code: err.code, message: err.message });
    return { ok: false, error: err };
  }

  // Stage 6: confirm.
  const result = await runConfirm(signature, {
    confirmSignature: deps.confirmSignature,
    signal: opts.signal,
  });

  if (result.err !== undefined) {
    emitRecord(ctx, "tx.failed", {
      signature,
      slot: result.slot,
      status: result.confirmationStatus,
      err: result.err,
    });
    return {
      ok: false,
      error: new TxSimulateFailedError(`Confirmation reported error: ${result.err}`, {
        details: { signature, slot: result.slot, status: result.confirmationStatus },
      }),
    };
  }

  emitRecord(ctx, "tx.confirmed", {
    signature,
    slot: result.slot,
    status: result.confirmationStatus,
  });
  return { ok: true, value: signature };
}

function defaultSimulateFirstGate(opts: { execute: boolean }): SimulateFirstVerdict {
  if (opts.execute === true) return { ok: true };
  return {
    ok: false,
    code: "SOLCLI_E_SAFETY_INTENT_REQUIRED",
    reason: "simulate-first default; pass --execute to proceed",
  };
}

interface CachedExecution {
  readonly version: 1;
  readonly ok: boolean;
  readonly signature?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

function serializeResult(value: Result<Signature, unknown>): string {
  const cached: CachedExecution = value.ok
    ? { version: 1, ok: true, signature: value.value as unknown as string }
    : {
        version: 1,
        ok: false,
        errorCode:
          value.error instanceof Error
            ? ((value.error as { code?: string }).code ?? "SOLCLI_E_GENERIC")
            : "SOLCLI_E_GENERIC",
        errorMessage: value.error instanceof Error ? value.error.message : String(value.error),
      };
  return JSON.stringify(cached);
}

function deserializeResult(raw: string): Result<Signature, unknown> {
  const parsed = JSON.parse(raw) as CachedExecution;
  if (parsed.ok && typeof parsed.signature === "string") {
    return { ok: true, value: parsed.signature as unknown as Signature };
  }
  return {
    ok: false,
    error: new TxSimulateFailedError(parsed.errorMessage ?? "Cached failure", {
      details: { code: parsed.errorCode },
    }),
  };
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code === "ABORT_ERR") return true;
  }
  return false;
}

function cryptoRequestId(clock: () => number): string {
  // Cheap, non-cryptographic id; the events writer is the source of truth for stronger ids.
  const t = clock().toString(36);
  const r = Math.floor(Math.random() * 0xffff).toString(36);
  return `r_${t}_${r}`;
}
