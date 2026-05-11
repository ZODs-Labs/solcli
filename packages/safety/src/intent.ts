import { isWritableRole } from "@solana/kit";
import type {
  EventRecord,
  IntentEnvelope,
  Lamports,
  Pubkey,
  SignableTransactionMessage,
  SimulationResult,
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
  message: SignableTransactionMessage,
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

  for (const ix of message.instructions) {
    const program = ix.programAddress;
    if (!programSet.has(program)) {
      programSet.add(program);
      programs.push(program);
    }
    if (ix.accounts === undefined) continue;
    for (const meta of ix.accounts) {
      if (isWritableRole(meta.role) && !writableSet.has(meta.address)) {
        writableSet.add(meta.address);
        writableAccounts.push(meta.address);
      }
    }
  }

  const summary =
    opts.summary ??
    `write-intent: ${message.instructions.length} ix across ${programs.length} program(s); fee ${simulation.feeLamports} lamports; delta ${lamportsDelta} lamports`;

  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary,
    payer: message.feePayer.address,
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
