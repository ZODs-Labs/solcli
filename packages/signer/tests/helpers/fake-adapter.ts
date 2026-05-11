import type { Pubkey } from "@solcli/contracts";
import type {
  AddSignerOptions,
  SignedTransaction,
  SignerAdapter,
  SignerAdapterKind,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignTransactionOptions,
  TransactionPlan,
} from "../../src/port.js";
import type { SignerAdapterFactory } from "../../src/registry.js";

/**
 * Lightweight adapter used by the registry tests. Tracks init/dispose
 * counts so tests can assert the lifecycle, but performs no real crypto.
 */
export interface FakeAdapter extends SignerAdapter {
  initCount: number;
  disposeCount: number;
  lastOptions: AddSignerOptions | undefined;
  signCalls: Array<{ alias: SignerAlias; plan: TransactionPlan }>;
}

export function createFakeAdapter(kind: SignerAdapterKind, pubkey: Pubkey): FakeAdapter {
  const adapter: FakeAdapter = {
    kind,
    initCount: 0,
    disposeCount: 0,
    lastOptions: undefined,
    signCalls: [],
    async init(deps) {
      adapter.initCount += 1;
      adapter.lastOptions = deps.options;
    },
    async dispose() {
      adapter.disposeCount += 1;
    },
    async sign(
      alias: SignerAlias,
      plan: TransactionPlan,
      _opts: SignTransactionOptions,
    ): Promise<SignedTransaction> {
      adapter.signCalls.push({ alias, plan });
      return {
        version: 0,
        payer: plan.payer,
        serializedMessage: new Uint8Array([1, 2, 3]),
        signatures: [],
      };
    },
    async read(alias: SignerAlias, _opts: SignerInfoOptions): Promise<SignerInfo> {
      return { alias, adapter: kind, pubkey, label: `${kind}-fake` };
    },
    async list(_opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
      return [];
    },
  };
  return adapter;
}

export function createFakeFactory(
  produce: (kind: SignerAdapterKind) => FakeAdapter,
): SignerAdapterFactory {
  return {
    create(kind) {
      return produce(kind);
    },
  };
}
