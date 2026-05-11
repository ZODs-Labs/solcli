import { SignerNotAvailableError } from "@solcli/errors";
import type {
  SignedTransaction,
  SignerAdapter,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerInitDeps,
  SignTransactionOptions,
  TransactionPlan,
} from "../port.js";

/**
 * v1 placeholder for the remote HTTP (mTLS) signer.
 *
 * Registers under the `remote` kind so routing tests can bind an alias
 * to it, but `sign` rejects with SOLCLI_E_SIGNER_NOT_AVAILABLE naming
 * the downstream flow that will deliver the real adapter. The stub
 * does not import any HTTP signer client; the real adapter will
 * lazy-load its transport inside `init` to preserve cold-start budgets.
 */
export const remoteStub: SignerAdapter = {
  kind: "remote",
  async init(_deps: SignerInitDeps): Promise<void> {
    return;
  },
  async dispose(): Promise<void> {
    return;
  },
  async sign(
    _alias: SignerAlias,
    _plan: TransactionPlan,
    _opts: SignTransactionOptions,
  ): Promise<SignedTransaction> {
    throw new SignerNotAvailableError(
      "Remote HTTP signer not implemented in v1. Downstream flow: remote-mtls-signer.",
      { details: { adapter: "remote" } },
    );
  },
  async read(alias: SignerAlias, _opts: SignerInfoOptions): Promise<SignerInfo> {
    return { alias, adapter: "remote", label: "remote stub" };
  },
  async list(_opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    return [];
  },
};
