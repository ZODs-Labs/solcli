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
 * v1 placeholder for the Squads v4 multisig signer.
 *
 * Registers under the `squads` kind so the registry can route an alias
 * to it, but `sign` rejects with SOLCLI_E_SIGNER_NOT_AVAILABLE naming
 * the downstream flow that will deliver the real adapter. The stub
 * imports no Squads SDK packages (not even type-only); the real
 * adapter will lazy-import its SDK inside `init` to preserve
 * cold-start budgets.
 */
export const squadsStub: SignerAdapter = {
  kind: "squads",
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
      "Squads multisig signer not implemented in v1. Downstream flow: squads-v4-integration.",
      { details: { adapter: "squads" } },
    );
  },
  async read(alias: SignerAlias, _opts: SignerInfoOptions): Promise<SignerInfo> {
    return { alias, adapter: "squads", label: "squads stub" };
  },
  async list(_opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    return [];
  },
};
