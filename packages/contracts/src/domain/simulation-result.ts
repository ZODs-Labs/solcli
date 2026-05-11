import type { Lamports } from "./amount.js";

export interface SimulationReturnData {
  readonly programId: string;
  readonly data: Uint8Array;
}

export interface SimulationAccountDelta {
  readonly pubkey: string;
  readonly lamportsBefore: bigint;
  readonly lamportsAfter: bigint;
}

export interface SimulationResult {
  readonly ok: boolean;
  readonly err?: string;
  readonly logs: readonly string[];
  readonly unitsConsumed?: number;
  readonly returnData?: SimulationReturnData;
  readonly accountsDelta?: readonly SimulationAccountDelta[];
  readonly feeLamports: Lamports;
}
