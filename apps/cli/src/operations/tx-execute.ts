import type {
  FeePolicy,
  GetPriorityFeePolicyPort,
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

  // Resolve ports via the provider registry. The wiring session will move
  // this resolution into a dedicated ctx.tx / ctx.safety surface.
  // TODO: wiring -- expose ctx.safety, ctx.tx, ctx.events on Context.
  const safetyPort = resolvePort(ctx.providers, "safetyEvaluate").port;
  const simulatePort = resolvePort(ctx.providers, "simulateTransaction").port;
  const executePort = resolvePort(ctx.providers, "executeTransaction").port;
  let feePort: GetPriorityFeePolicyPort | undefined;
  try {
    feePort = resolvePort(ctx.providers, "getPriorityFeePolicy").port;
  } catch {
    feePort = undefined;
  }

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

  // Stage 4: optional priority-fee recommendation. Missing fee port is not
  // a hard error; the active provider may not support priority fees.
  let priorityFeeMicroLamports: bigint | undefined;
  if (feePort && args.feePolicy.kind !== "none") {
    try {
      priorityFeeMicroLamports = await feePort.recommend(args.plan, { signal });
    } catch (err: unknown) {
      ctx.logger.debug({ err, op: "tx-execute" }, "priority fee recommend failed");
    }
  }

  // Stage 5: synthesize a signed intent for downstream attestation.
  const intent: IntentEnvelope = safetyPort.summarizeIntent(args.plan, simulation, safetyOpts);

  // Stage 6: execute (sign + send + confirm; performed by the execute port).
  if (signal.aborted) {
    return { ok: false, error: new InternalError("aborted before tx send") };
  }
  const execResult = await executePort.execute(args.plan, {
    signal,
    idempotencyKey: args.idempotencyKey,
    costBudgetLamports: args.maxCostLamports,
    allowedPrograms: args.allowedPrograms,
    ...(args.via !== undefined ? { via: args.via } : {}),
  });
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
      error: new InternalError("execute port returned an unknown error", {
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
