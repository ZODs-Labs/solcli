import type { IntentEnvelope } from "../domain/intent-envelope.js";
import type { SimulationResult } from "../domain/simulation-result.js";
import type { TransactionPlan } from "../domain/tx-plan.js";

export interface SafetyEvaluateOptions {
  readonly execute: boolean;
  readonly idempotencyKey: string;
  readonly costBudgetLamports: bigint;
  readonly allowedPrograms: readonly string[];
  readonly maxSlippageBps?: number;
}

export interface SafetyVerdict {
  readonly ok: boolean;
  readonly code?: string;
  readonly reason?: string;
}

export interface SafetyEvaluatePort {
  evaluateBuild(plan: TransactionPlan, opts: SafetyEvaluateOptions): SafetyVerdict;
  evaluateSimulation(
    plan: TransactionPlan,
    simulation: SimulationResult,
    opts: SafetyEvaluateOptions,
  ): SafetyVerdict;
  summarizeIntent(
    plan: TransactionPlan,
    simulation: SimulationResult,
    opts: SafetyEvaluateOptions,
  ): IntentEnvelope;
}
