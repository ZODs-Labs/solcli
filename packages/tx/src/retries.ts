import { RpcRateLimitError } from "@solcli/errors";
import { sleepWithSignal } from "./sleep.js";

export interface WithRetriesOptions {
  readonly signal: AbortSignal;
  readonly maxAttempts?: number;
  readonly baseMs?: number;
  readonly capMs?: number;
  readonly retryOn: (err: unknown, attempt: number) => boolean;
  readonly rng?: () => number;
}

export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts: WithRetriesOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseMs = opts.baseMs ?? 100;
  const capMs = opts.capMs ?? 5000;
  const rng = opts.rng ?? Math.random;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    opts.signal.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      if (!opts.retryOn(err, attempt)) throw err;
      const retryAfterMs = extractRetryAfterMs(err);
      const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
      const jittered = Math.floor(rng() * exp);
      const delay = Math.max(retryAfterMs ?? 0, jittered);
      await sleepWithSignal(delay, opts.signal);
    }
  }
  throw lastErr;
}

function extractRetryAfterMs(err: unknown): number | undefined {
  if (err instanceof RpcRateLimitError) {
    const details = err.details;
    if (details !== undefined) {
      const raw = details["retryAfterMs"];
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
      const sec = details["retryAfter"];
      if (typeof sec === "number" && Number.isFinite(sec) && sec >= 0) return sec * 1000;
    }
  }
  return undefined;
}
