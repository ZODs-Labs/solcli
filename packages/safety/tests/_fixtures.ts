import type {
  Blockhash,
  Lamports,
  Pubkey,
  SimulationResult,
  TransactionPlan,
} from "@solcli/contracts";

export function pk(s: string): Pubkey {
  return s as Pubkey;
}

export function bh(s: string): Blockhash {
  return s as Blockhash;
}

export function lam(n: bigint): Lamports {
  return n as Lamports;
}

export function plan(
  overrides: Partial<{
    payer: Pubkey;
    instructions: TransactionPlan["instructions"];
    expectedSigners: readonly Pubkey[];
    tags: Readonly<Record<string, string>>;
  }> = {},
): TransactionPlan {
  return {
    version: 0,
    payer: overrides.payer ?? pk("payerA"),
    recentBlockhash: bh("bh1"),
    instructions: overrides.instructions ?? [
      {
        programId: pk("prog1"),
        keys: [
          { pubkey: pk("acc1"), isSigner: false, isWritable: true },
          { pubkey: pk("acc2"), isSigner: true, isWritable: false },
        ],
        data: new Uint8Array(),
      },
    ],
    expectedSigners: overrides.expectedSigners ?? [pk("payerA")],
    ...(overrides.tags !== undefined ? { tags: overrides.tags } : {}),
  };
}

export function simulation(
  overrides: Partial<{
    feeLamports: Lamports;
    accountsDelta: SimulationResult["accountsDelta"];
    logs: readonly string[];
  }> = {},
): SimulationResult {
  return {
    ok: true,
    logs: overrides.logs ?? [],
    feeLamports: overrides.feeLamports ?? lam(5000n),
    ...(overrides.accountsDelta !== undefined ? { accountsDelta: overrides.accountsDelta } : {}),
  };
}
