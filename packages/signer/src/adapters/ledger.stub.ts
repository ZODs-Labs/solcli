import { SignerNotAvailableError } from "@solcli/errors";
import type {
  SignableTransactionMessage,
  SignedTransaction,
  SignerAdapter,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerInitDeps,
  SignTransactionOptions,
} from "../port.js";

/**
 * v1 placeholder for the Ledger hardware signer.
 *
 * The adapter registers under the `ledger` kind so routing tests can
 * resolve an alias bound to it, but every `sign` call rejects with
 * SOLCLI_E_SIGNER_NOT_AVAILABLE pointing at the downstream flow that
 * will deliver the real implementation. The stub holds no state and
 * imports no Ledger SDK packages (not even type-only); the real
 * adapter will lazy-import its SDK inside `init` to keep cold-start
 * budgets intact.
 */
export const ledgerStub: SignerAdapter = {
  kind: "ledger",
  async init(_deps: SignerInitDeps): Promise<void> {
    return;
  },
  async dispose(): Promise<void> {
    return;
  },
  async sign(
    _alias: SignerAlias,
    _message: SignableTransactionMessage,
    _opts: SignTransactionOptions,
  ): Promise<SignedTransaction> {
    throw new SignerNotAvailableError(
      "Ledger signer not implemented in v1. Downstream flow: ledger-hardware-signer integration.",
      { details: { adapter: "ledger" } },
    );
  },
  async read(alias: SignerAlias, _opts: SignerInfoOptions): Promise<SignerInfo> {
    return { alias, adapter: "ledger", label: "ledger stub" };
  },
  async list(_opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    return [];
  },
};
