import { setTimeout as setTimeoutAsync } from "node:timers/promises";

export async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await setTimeoutAsync(ms, undefined, { signal });
}
