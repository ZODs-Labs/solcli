import type { IntentEnvelope } from "../domain/intent-envelope.js";
import type { SimulationResult } from "../domain/simulation-result.js";
import type { SignableTransactionMessage } from "../domain/tx-plan.js";

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
  evaluateBuild(message: SignableTransactionMessage, opts: SafetyEvaluateOptions): SafetyVerdict;
  evaluateSimulation(
    message: SignableTransactionMessage,
    simulation: SimulationResult,
    opts: SafetyEvaluateOptions,
  ): SafetyVerdict;
  summarizeIntent(
    message: SignableTransactionMessage,
    simulation: SimulationResult,
    opts: SafetyEvaluateOptions,
  ): IntentEnvelope;
}
