import type {
  EventRecord,
  IntentEnvelope,
  Lamports,
  Pubkey,
  SimulationResult,
  TransactionPlan,
} from "@solcli/contracts";

export interface SummarizeIntentInput {
  readonly costBudgetLamports: bigint;
  readonly idempotencyKey: string;
  readonly signerAlias: string;
  readonly summary?: string;
}

function asLamports(n: bigint): Lamports {
  return n as Lamports;
}

export function summarizeIntent(
  plan: TransactionPlan,
  simulation: SimulationResult,
  opts: SummarizeIntentInput,
): IntentEnvelope {
  let lamportsDelta = 0n;
  if (simulation.accountsDelta !== undefined) {
    for (const delta of simulation.accountsDelta) {
      lamportsDelta += delta.lamportsAfter - delta.lamportsBefore;
    }
  }

  const programSet = new Set<string>();
  const programs: Pubkey[] = [];
  const writableSet = new Set<string>();
  const writableAccounts: Pubkey[] = [];

  for (const ix of plan.instructions) {
    if (!programSet.has(ix.programId)) {
      programSet.add(ix.programId);
      programs.push(ix.programId);
    }
    for (const meta of ix.keys) {
      if (meta.isWritable && !writableSet.has(meta.pubkey)) {
        writableSet.add(meta.pubkey);
        writableAccounts.push(meta.pubkey);
      }
    }
  }

  const summary =
    opts.summary ??
    `write-intent: ${plan.instructions.length} ix across ${programs.length} program(s); fee ${simulation.feeLamports} lamports; delta ${lamportsDelta} lamports`;

  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary,
    payer: plan.payer,
    programs,
    lamportsDelta: asLamports(lamportsDelta),
    writableAccounts,
    costBudgetLamports: asLamports(opts.costBudgetLamports),
    idempotencyKey: opts.idempotencyKey,
    signerAlias: opts.signerAlias,
  };
}

export interface EmitIntentDeps {
  readonly emit: (record: EventRecord<"intent.emitted", IntentEnvelope>) => void;
  readonly clock: () => number;
  readonly requestId: string;
}

export function emitIntent(envelope: IntentEnvelope, deps: EmitIntentDeps): void {
  const record: EventRecord<"intent.emitted", IntentEnvelope> = {
    schemaVersion: 1,
    kind: "intent.emitted",
    time: new Date(deps.clock()).toISOString(),
    requestId: deps.requestId,
    data: envelope,
  };
  deps.emit(record);
}
