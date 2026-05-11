export interface PortCallOptions {
  readonly signal?: AbortSignal;
}

export type Verdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly reason: string };
