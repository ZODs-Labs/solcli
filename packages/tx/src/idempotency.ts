export interface IdempotencyCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
}

export const IDEMPOTENCY_TTL_MS = 86_400_000;

export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
  cache: IdempotencyCache,
  serialize: (value: T) => string,
  deserialize: (raw: string) => T,
  ttlMs: number = IDEMPOTENCY_TTL_MS,
): Promise<T> {
  const hit = await cache.get(key);
  if (hit !== undefined) {
    return deserialize(hit);
  }
  const result = await fn();
  await cache.set(key, serialize(result), ttlMs);
  return result;
}
