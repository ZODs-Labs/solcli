import type { Pubkey } from "../domain/pubkey.js";
import type { SignerAlias } from "../domain/signer-alias.js";

export type SignerAdapter = "file" | "env" | "keychain" | "ledger" | "squads" | "remote";

export interface SignerInfo {
  readonly alias: SignerAlias;
  readonly adapter: SignerAdapter;
  readonly pubkey?: Pubkey;
  readonly label?: string;
}

export interface SignerInfoOptions {
  readonly signal: AbortSignal;
}

export interface SignerInfoPort {
  read(alias: SignerAlias, opts: SignerInfoOptions): Promise<SignerInfo>;
  list(opts: SignerInfoOptions): Promise<readonly SignerInfo[]>;
}
