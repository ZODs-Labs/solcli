import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type {
  Blockhash,
  Instruction,
  Lamports,
  Pubkey,
  SignableTransactionMessage,
  SimulationResult,
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
    instructions: readonly Instruction[];
  }> = {},
): SignableTransactionMessage {
  const payer = overrides.payer ?? pk("payerA");
  const instructions: readonly Instruction[] = overrides.instructions ?? [
    {
      programAddress: pk("prog1"),
      accounts: [
        { address: pk("acc1"), role: AccountRole.WRITABLE },
        { address: pk("acc2"), role: AccountRole.READONLY_SIGNER },
      ],
      data: new Uint8Array(),
    },
  ];
  let msg: SignableTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: bh("bh1"), lastValidBlockHeight: 0n },
        m,
      ),
  );
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }
  return msg;
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
