import type { AnchorIdl } from "../domain/idl.js";
import type { Pubkey } from "../domain/pubkey.js";

export interface IdlFetchOptions {
  readonly signal: AbortSignal;
  readonly fromPath?: string;
}

export interface IdlFetchPort {
  fetch(programId: Pubkey, opts: IdlFetchOptions): Promise<AnchorIdl>;
}
