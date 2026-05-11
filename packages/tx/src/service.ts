import type {
  EmitEventPort,
  ExecuteTransactionOptions,
  FeePolicy,
  GetPriorityFeePolicyPort,
  Result,
  Signature,
  SignedTransaction,
  SignerAlias,
  SignTransactionPort,
  SimulateTransactionPort,
  SimulationResult,
  SubmitBundlePort,
  TransactionPlan,
} from "@solcli/contracts";
import { runExecute } from "./execute.js";
import { runSimulate } from "./stages/simulate.js";

export interface TxCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
}

export interface TxLogger {
  debug(o: object, msg: string): void;
  info(o: object, msg: string): void;
  warn(o: object, msg: string): void;
  trace(o: object, msg: string): void;
}

export interface BlockhashRefreshResult {
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
}

export interface ConfirmResult {
  readonly slot: number;
  readonly confirmationStatus: "processed" | "confirmed" | "finalized";
  readonly err?: string;
}

export interface SimulateFirstVerdict {
  readonly ok: boolean;
  readonly code?: string;
  readonly reason?: string;
}

export interface TransactionServiceDeps {
  readonly simulate: SimulateTransactionPort;
  readonly fee: GetPriorityFeePolicyPort;
  readonly sign: SignTransactionPort;
  readonly bundle?: SubmitBundlePort;
  readonly events?: EmitEventPort;
  readonly cache: TxCache;
  readonly clock: () => number;
  readonly logger: TxLogger;
  readonly sendRawTransaction: (
    signed: SignedTransaction,
    opts: { signal: AbortSignal },
  ) => Promise<Signature>;
  readonly confirmSignature: (
    sig: Signature,
    opts: { signal: AbortSignal },
  ) => Promise<ConfirmResult>;
  readonly refreshBlockhash: (opts: { signal: AbortSignal }) => Promise<BlockhashRefreshResult>;
  readonly evaluateSimulateFirst?: (opts: { execute: boolean }) => SimulateFirstVerdict;
  readonly newRequestId?: () => string;
}

export interface ExecuteOptionsExtended extends ExecuteTransactionOptions {
  readonly execute?: boolean;
  readonly maxSlippageBps?: number;
  readonly tipAccount?: string;
  readonly tipLamports?: bigint;
}

export interface TransactionService {
  execute(
    plan: TransactionPlan,
    opts: ExecuteOptionsExtended,
    alias: SignerAlias,
    feePolicy: FeePolicy,
  ): Promise<Result<Signature, unknown>>;
  simulate(plan: TransactionPlan, opts: { signal: AbortSignal }): Promise<SimulationResult>;
}

export function createTransactionService(deps: TransactionServiceDeps): TransactionService {
  return {
    async execute(plan, opts, alias, feePolicy) {
      return runExecute(deps, plan, opts, alias, feePolicy);
    },
    async simulate(plan, opts) {
      return runSimulate(plan, { simulate: deps.simulate, signal: opts.signal });
    },
  };
}
