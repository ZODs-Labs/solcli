import type {
  FeePolicy,
  IntentEnvelope,
  Lamports,
  Result,
  SignableTransactionMessage,
  Signature,
  SimulationResult,
} from "@solcli/contracts";
import {
  InternalError,
  SafetyBudgetExceededError,
  SafetyIntentRequiredError,
  SafetyProgramDeniedError,
  type SolcliError,
  TxSimulateFailedError,
} from "@solcli/errors";
import type { Context } from "../context.js";
import { resolvePort } from "./resolve-port.js";

/**
 * Inputs to {@link txExecute}. The shape mirrors the signature documented in
 * the reference-protocols design (Task E3 §4.3). The wiring session is
 * expected to expose richer `ctx.tx` / `ctx.safety` / `ctx.events` surfaces
 * later; until then this operation composes the underlying ports directly.
 */
export interface TxExecuteArgs {
  readonly plan: SignableTransactionMessage;
  readonly alias: string;
  readonly feePolicy: FeePolicy;
  readonly execute: boolean;
  readonly idempotencyKey: string;
  readonly maxCostLamports: bigint;
  readonly allowedPrograms: readonly string[];
  readonly via?: "rpc" | "jito";
  readonly signal?: AbortSignal;
}

export interface TxExecuteSuccess {
  readonly signature: Signature;
  readonly intent: IntentEnvelope;
  readonly simulation: SimulationResult;
  readonly priorityFeeMicroLamports?: bigint;
}

/**
 * Compose the safety, simulate and execute ports into the single state-changing
 * pipeline used by every write command.
 *
 * Stages: build-time safety gate, pre-flight simulation, post-sim safety gate,
 * optional priority-fee recommendation, intent attestation, send + confirm.
 *
 * Returns a discriminated {@link Result} so callers can format errors through
 * the JSON envelope without unwinding the stack.
 */
export async function txExecute(
  ctx: Context,
  args: TxExecuteArgs,
): Promise<Result<TxExecuteSuccess, SolcliError>> {
  const signal = args.signal ?? ctx.abortController.signal;
  if (signal.aborted) {
    return { ok: false, error: new InternalError("aborted before tx-execute started") };
  }

  // ctx.tx is the canonical sign + send + confirm pipeline. We still resolve
  // safety + simulate through the provider registry because they are pure
  // domain ports; ctx.tx itself does its own simulate as the second stage,
  // but the operation layer also runs an explicit pre-flight simulate so
  // commands can render the result on the simulate-only path.
  const safetyPort = ctx.safety;
  const simulatePort = resolvePort(ctx.providers, "simulateTransaction").port;

  const safetyOpts = {
    execute: args.execute,
    idempotencyKey: args.idempotencyKey,
    costBudgetLamports: args.maxCostLamports,
    allowedPrograms: args.allowedPrograms,
  } as const;

  // Stage 1: build-time gate (program allowlist, intent flag present, etc.).
  const buildVerdict = safetyPort.evaluateBuild(args.plan, safetyOpts);
  if (!buildVerdict.ok) {
    return { ok: false, error: toSafetyError(buildVerdict.code, buildVerdict.reason) };
  }

  // Stage 2: pre-flight simulate against the freshly-built plan.
  if (signal.aborted) {
    return { ok: false, error: new InternalError("aborted after safety build gate") };
  }
  const simulation: SimulationResult = await simulatePort.simulate(args.plan, {
    signal,
    replaceRecentBlockhash: false,
    sigVerify: false,
  });
  if (!simulation.ok) {
    return {
      ok: false,
      error: new TxSimulateFailedError("Pre-flight simulation failed", {
        details: {
          err: simulation.err,
          logs: simulation.logs.slice(-12),
          feeLamports: (simulation.feeLamports as unknown as bigint).toString(),
        },
      }),
    };
  }

  // Stage 3: post-sim gate (binds simulated fee to the cost budget).
  const simVerdict = safetyPort.evaluateSimulation(args.plan, simulation, safetyOpts);
  if (!simVerdict.ok) {
    return { ok: false, error: toSafetyError(simVerdict.code, simVerdict.reason) };
  }

  // Stage 4: priority-fee recommendation is folded into ctx.tx now (the fee
  // dep is part of TransactionServiceDeps). The local fee port lookup is gone.
  const priorityFeeMicroLamports: bigint | undefined = undefined;

  // Stage 5: synthesize a signed intent for downstream attestation.
  const intent: IntentEnvelope = safetyPort.summarizeIntent(args.plan, simulation, safetyOpts);

  // Stage 6: hand off to ctx.tx (sign + send + confirm). The service does
  // its own intent + safety gating internally; the operation layer's safety
  // is the early-exit hint for the simulate-only path.
  if (signal.aborted) {
    return { ok: false, error: new InternalError("aborted before tx send") };
  }
  const execResult = await ctx.tx.execute(
    args.plan,
    {
      signal,
      idempotencyKey: args.idempotencyKey,
      costBudgetLamports: args.maxCostLamports,
      allowedPrograms: args.allowedPrograms,
      execute: args.execute,
      ...(args.via !== undefined ? { via: args.via } : {}),
    },
    args.alias as unknown as Parameters<typeof ctx.tx.execute>[2],
    args.feePolicy,
  );
  if (!execResult.ok) {
    const cause = execResult.error;
    if (cause instanceof Error) {
      return {
        ok: false,
        error: new InternalError(cause.message, { cause }),
      };
    }
    return {
      ok: false,
      error: new InternalError("ctx.tx returned an unknown error", {
        details: { raw: String(cause) },
      }),
    };
  }

  const success: TxExecuteSuccess = {
    signature: execResult.value,
    intent,
    simulation,
    ...(priorityFeeMicroLamports !== undefined ? { priorityFeeMicroLamports } : {}),
  };
  return { ok: true, value: success };
}

function toSafetyError(code: string | undefined, reason: string | undefined): SolcliError {
  const message = reason ?? "safety gate rejected the transaction";
  const details: Record<string, unknown> = {};
  if (code !== undefined) details["code"] = code;
  if (reason !== undefined) details["reason"] = reason;
  if (code === "SOLCLI_E_SAFETY_BUDGET_EXCEEDED") {
    return new SafetyBudgetExceededError(message, { details });
  }
  if (code === "SOLCLI_E_SAFETY_PROGRAM_DENIED") {
    return new SafetyProgramDeniedError(message, { details });
  }
  return new SafetyIntentRequiredError(message, { details });
}

// Re-export the Lamports type to keep the public operation surface
// self-contained for callers that import from this module.
export type { Lamports };
