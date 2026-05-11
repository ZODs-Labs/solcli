import type { Bundle } from "../domain/bundle.js";
import type { Signature } from "../domain/signature.js";

export interface SubmitBundleOptions {
  readonly signal: AbortSignal;
}

export interface SubmitBundlePort {
  submit(bundle: Bundle, opts: SubmitBundleOptions): Promise<readonly Signature[]>;
}
