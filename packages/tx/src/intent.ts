import { isWritableRole } from "@solana/kit";
import type {
  IntentEnvelope,
  Lamports,
  Pubkey,
  SignableTransactionMessage,
  SimulationResult,
} from "@solcli/contracts";

export function lamportsDeltaForPayer(
  message: SignableTransactionMessage,
  simulation: SimulationResult,
): bigint {
  if (simulation.accountsDelta === undefined) return 0n;
  let delta = 0n;
  const payer = message.feePayer.address;
  for (const a of simulation.accountsDelta) {
    if (a.pubkey === payer) {
      delta += a.lamportsAfter - a.lamportsBefore;
    }
  }
  // Lamports OUT of the payer is a negative delta; the safety budget compares
  // outflow, so we return the absolute value.
  return delta < 0n ? -delta : delta;
}

export function distinctProgramIds(message: SignableTransactionMessage): readonly Pubkey[] {
  const seen = new Set<string>();
  const out: Pubkey[] = [];
  for (const ix of message.instructions) {
    const k = ix.programAddress as string;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ix.programAddress);
    }
  }
  return out;
}

export function writableAccounts(message: SignableTransactionMessage): readonly Pubkey[] {
  const seen = new Set<string>();
  const out: Pubkey[] = [];
  for (const ix of message.instructions) {
    if (ix.accounts === undefined) continue;
    for (const meta of ix.accounts) {
      if (!isWritableRole(meta.role)) continue;
      const k = meta.address as string;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(meta.address);
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
  message: SignableTransactionMessage,
  simulation: SimulationResult,
  opts: IntentSummaryOptions,
): IntentEnvelope {
  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary: opts.summary,
    payer: message.feePayer.address,
    programs: distinctProgramIds(message),
    lamportsDelta: lamportsDeltaForPayer(message, simulation) as Lamports,
    writableAccounts: writableAccounts(message),
    costBudgetLamports: opts.costBudgetLamports,
    idempotencyKey: opts.idempotencyKey,
    signerAlias: opts.signerAlias,
  };
}
