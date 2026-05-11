import type {
  IntentEnvelope,
  Lamports,
  Pubkey,
  SimulationResult,
  TransactionPlan,
} from "@solcli/contracts";

export function lamportsDeltaForPayer(plan: TransactionPlan, simulation: SimulationResult): bigint {
  if (simulation.accountsDelta === undefined) return 0n;
  let delta = 0n;
  for (const a of simulation.accountsDelta) {
    if (a.pubkey === (plan.payer as unknown as string)) {
      delta += a.lamportsAfter - a.lamportsBefore;
    }
  }
  // Lamports OUT of the payer is a negative delta; the safety budget compares
  // outflow, so we return the absolute value.
  return delta < 0n ? -delta : delta;
}

export function distinctProgramIds(plan: TransactionPlan): readonly Pubkey[] {
  const seen = new Set<string>();
  const out: Pubkey[] = [];
  for (const ix of plan.instructions) {
    const k = ix.programId as unknown as string;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ix.programId);
    }
  }
  return out;
}

export function writableAccounts(plan: TransactionPlan): readonly Pubkey[] {
  const seen = new Set<string>();
  const out: Pubkey[] = [];
  for (const ix of plan.instructions) {
    for (const meta of ix.keys) {
      if (!meta.isWritable) continue;
      const k = meta.pubkey as unknown as string;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(meta.pubkey);
    }
  }
  return out;
}

export interface IntentSummaryOptions {
  readonly summary: string;
  readonly idempotencyKey: string;
  readonly costBudgetLamports: Lamports;
  readonly signerAlias: string;
}

export function buildIntent(
  plan: TransactionPlan,
  simulation: SimulationResult,
  opts: IntentSummaryOptions,
): IntentEnvelope {
  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary: opts.summary,
    payer: plan.payer,
    programs: distinctProgramIds(plan),
    lamportsDelta: lamportsDeltaForPayer(plan, simulation) as Lamports,
    writableAccounts: writableAccounts(plan),
    costBudgetLamports: opts.costBudgetLamports,
    idempotencyKey: opts.idempotencyKey,
    signerAlias: opts.signerAlias,
  };
}
