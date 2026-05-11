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
  Bundle,
  EmitEventPort,
  EventRecord,
  GetPriorityFeePolicyOptions,
  GetPriorityFeePolicyPort,
  IntentEnvelope,
  Lamports,
  Pubkey,
  SignableTransactionMessage,
  Signature,
  SignedTransaction,
  SignerAlias,
  SignTransactionOptions,
  SignTransactionPort,
  SimulateTransactionOptions,
  SimulateTransactionPort,
  SimulationResult,
  SubmitBundleOptions,
  SubmitBundlePort,
} from "@solcli/contracts";
import type { TransactionServiceDeps } from "../src/service.js";

export const PAYER = "PAYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA11" as unknown as Pubkey;
export const PROGRAM = "PROGRAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA11" as unknown as Pubkey;
export const TIP = "TIPACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA11" as unknown as Pubkey;
export const BLOCKHASH = "BLOCKHASHAAAAAAAAAAAAAAAAAAAAAAAA" as unknown as Blockhash;
export const NEXT_BLOCKHASH = "REFRESHEDBHAAAAAAAAAAAAAAAAAAAAA";
export const SIGNATURE_OK =
  "SIG_OK_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" as unknown as Signature;
export const SIGNATURE_BUNDLE =
  "SIG_BUNDLE_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" as unknown as Signature;
export const ALIAS = "default" as unknown as SignerAlias;

export function makePlan(): SignableTransactionMessage {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(PAYER, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 0n },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        {
          programAddress: PROGRAM,
          accounts: [{ address: PAYER, role: AccountRole.WRITABLE_SIGNER }],
          data: new Uint8Array([1, 2, 3]),
        },
        m,
      ),
  );
}

export function makeSimulation(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    ok: true,
    logs: [],
    unitsConsumed: 12345,
    feeLamports: 5000n as Lamports,
    accountsDelta: [
      {
        pubkey: PAYER as unknown as string,
        lamportsBefore: 1_000_000n,
        lamportsAfter: 999_000n,
      },
    ],
    ...overrides,
  };
}

export function makeSignedTransaction(sig: Signature = SIGNATURE_OK): SignedTransaction {
  return {
    version: 0,
    payer: PAYER,
    serializedMessage: new Uint8Array([0xaa]),
    signatures: [{ signer: PAYER, signature: sig }],
  };
}

export interface StubSimulatePort extends SimulateTransactionPort {
  readonly calls: SimulateTransactionOptions[];
}

export function stubSimulatePort(
  impl?: (plan: SignableTransactionMessage) => SimulationResult,
): StubSimulatePort {
  const calls: SimulateTransactionOptions[] = [];
  return {
    calls,
    async simulate(plan, opts) {
      calls.push(opts);
      return impl?.(plan) ?? makeSimulation();
    },
  };
}

export function stubFeePort(value: bigint = 1234n): GetPriorityFeePolicyPort & {
  calls: GetPriorityFeePolicyOptions[];
} {
  const calls: GetPriorityFeePolicyOptions[] = [];
  return {
    calls,
    async recommend(_plan, opts) {
      calls.push(opts);
      return value;
    },
  };
}

export interface StubSignPort extends SignTransactionPort {
  readonly callLog: {
    alias: SignerAlias;
    plan: SignableTransactionMessage;
    intent: IntentEnvelope;
  }[];
}

export function stubSignPort(
  impl?: (plan: SignableTransactionMessage) => SignedTransaction,
): StubSignPort {
  const callLog: {
    alias: SignerAlias;
    plan: SignableTransactionMessage;
    intent: IntentEnvelope;
  }[] = [];
  return {
    callLog,
    async sign(alias, plan, opts: SignTransactionOptions) {
      callLog.push({ alias, plan, intent: opts.intent });
      return impl?.(plan) ?? makeSignedTransaction();
    },
  };
}

export interface StubBundlePort extends SubmitBundlePort {
  readonly submitCalls: { bundle: Bundle; opts: SubmitBundleOptions }[];
}

export function stubBundlePort(sig: Signature = SIGNATURE_BUNDLE): StubBundlePort {
  const submitCalls: { bundle: Bundle; opts: SubmitBundleOptions }[] = [];
  return {
    submitCalls,
    async submit(bundle, opts) {
      submitCalls.push({ bundle, opts });
      return [sig];
    },
  };
}

export interface MemoryCache {
  readonly store: Map<string, string>;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export function memoryCache(initial?: Record<string, string>): MemoryCache {
  const store = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    store,
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}

export interface MemoryEventsPort extends EmitEventPort {
  readonly records: EventRecord[];
}

export function memoryEventsPort(): MemoryEventsPort {
  const records: EventRecord[] = [];
  return {
    records,
    emit(record) {
      records.push(record);
    },
    async flush() {
      // no-op
    },
  };
}

export function nullLogger(): TransactionServiceDeps["logger"] {
  return {
    debug() {},
    info() {},
    warn() {},
    trace() {},
  };
}

export interface DepsOverrides {
  simulate?: TransactionServiceDeps["simulate"];
  fee?: TransactionServiceDeps["fee"];
  sign?: TransactionServiceDeps["sign"];
  bundle?: TransactionServiceDeps["bundle"];
  events?: TransactionServiceDeps["events"];
  cache?: TransactionServiceDeps["cache"];
  logger?: TransactionServiceDeps["logger"];
  clock?: TransactionServiceDeps["clock"];
  sendRawTransaction?: TransactionServiceDeps["sendRawTransaction"];
  confirmSignature?: TransactionServiceDeps["confirmSignature"];
  refreshBlockhash?: TransactionServiceDeps["refreshBlockhash"];
  evaluateSimulateFirst?: TransactionServiceDeps["evaluateSimulateFirst"];
  newRequestId?: TransactionServiceDeps["newRequestId"];
}

export function makeDeps(overrides: DepsOverrides = {}): TransactionServiceDeps {
  const cache = overrides.cache ?? memoryCache();
  const deps: TransactionServiceDeps = {
    simulate: overrides.simulate ?? stubSimulatePort(),
    fee: overrides.fee ?? stubFeePort(),
    sign: overrides.sign ?? stubSignPort(),
    cache,
    logger: overrides.logger ?? nullLogger(),
    clock: overrides.clock ?? (() => 0),
    sendRawTransaction: overrides.sendRawTransaction ?? (async () => SIGNATURE_OK),
    confirmSignature:
      overrides.confirmSignature ??
      (async () => ({ slot: 1, confirmationStatus: "confirmed" as const })),
    refreshBlockhash:
      overrides.refreshBlockhash ??
      (async () => ({ blockhash: NEXT_BLOCKHASH, lastValidBlockHeight: 100n })),
    newRequestId: overrides.newRequestId ?? (() => "r_fixed"),
    ...(overrides.bundle !== undefined ? { bundle: overrides.bundle } : {}),
    ...(overrides.events !== undefined ? { events: overrides.events } : {}),
    ...(overrides.evaluateSimulateFirst !== undefined
      ? { evaluateSimulateFirst: overrides.evaluateSimulateFirst }
      : {}),
  };
  return deps;
}

export const EXECUTE_OPTS_BASE = {
  idempotencyKey: "key-1",
  costBudgetLamports: 1_000_000n,
  allowedPrograms: [PROGRAM as unknown as string],
  execute: true,
} as const;
