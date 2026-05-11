import type { EventKind, EventRecord, SafetyEvaluatePort, SafetyVerdict } from "@solcli/contracts";
import { evaluateAllowedPrograms } from "./allowed-programs.js";
import { evaluateCostBudget } from "./cost-budget.js";
import { evaluateIdempotency } from "./idempotency.js";
import { emitIntent, summarizeIntent } from "./intent.js";
import { evaluateSimulateFirst } from "./simulate-first.js";
import { evaluateSlippage } from "./slippage.js";

export type { HasIdempotencyKey } from "./idempotency.js";
export type { EmitIntentDeps, SummarizeIntentInput } from "./intent.js";
export type { SlippageAmounts } from "./slippage.js";
export {
  emitIntent,
  evaluateAllowedPrograms,
  evaluateCostBudget,
  evaluateIdempotency,
  evaluateSimulateFirst,
  evaluateSlippage,
  summarizeIntent,
};

export interface SafetyGateEventData {
  readonly gate: string;
  readonly verdict: SafetyVerdict;
}

export interface CreateSafetyEvaluatorDeps {
  readonly emit?: (record: EventRecord) => void;
  readonly clock?: () => number;
  readonly requestId?: string;
  readonly seenIdempotencyKeys?: ReadonlySet<string>;
}

function compose(verdicts: readonly SafetyVerdict[]): SafetyVerdict {
  for (const v of verdicts) {
    if (!v.ok) return v;
  }
  return { ok: true };
}

export function createSafetyEvaluator(deps?: CreateSafetyEvaluatorDeps): SafetyEvaluatePort {
  const seen = deps?.seenIdempotencyKeys ?? new Set<string>();
  const hasKey = (k: string): boolean => seen.has(k);

  function maybeEmit(verdict: SafetyVerdict, gate: string): void {
    if (deps?.emit === undefined) return;
    const now = deps.clock !== undefined ? deps.clock() : 0;
    const requestId = deps.requestId !== undefined ? deps.requestId : "";
    const kind: EventKind = verdict.ok ? "safety.gate.passed" : "safety.gate.rejected";
    const record: EventRecord<EventKind, SafetyGateEventData> = {
      schemaVersion: 1,
      kind,
      time: new Date(now).toISOString(),
      requestId,
      data: { gate, verdict },
    };
    deps.emit(record);
  }

  return {
    evaluateBuild(plan, opts) {
      const allowSet = new Set(opts.allowedPrograms);
      const simFirst = evaluateSimulateFirst({ execute: opts.execute });
      maybeEmit(simFirst, "simulate-first");
      const idem = evaluateIdempotency(opts.idempotencyKey, hasKey);
      maybeEmit(idem, "idempotency");
      const programs = evaluateAllowedPrograms(plan, allowSet);
      maybeEmit(programs, "allowed-programs");
      return compose([simFirst, idem, programs]);
    },
    evaluateSimulation(plan, simulation, opts) {
      const allowSet = new Set(opts.allowedPrograms);
      let outflow = 0n;
      if (simulation.accountsDelta !== undefined) {
        for (const d of simulation.accountsDelta) {
          const diff = d.lamportsAfter - d.lamportsBefore;
          if (diff < 0n) outflow += -diff;
        }
      }
      const budget = evaluateCostBudget(simulation, opts.costBudgetLamports, outflow);
      maybeEmit(budget, "cost-budget");
      const programs = evaluateAllowedPrograms(plan, allowSet);
      maybeEmit(programs, "allowed-programs");
      return compose([budget, programs]);
    },
    summarizeIntent(plan, simulation, opts) {
      const signerAlias = plan.tags?.["signerAlias"] ?? "";
      return summarizeIntent(plan, simulation, {
        costBudgetLamports: opts.costBudgetLamports,
        idempotencyKey: opts.idempotencyKey,
        signerAlias,
      });
    },
  };
}
