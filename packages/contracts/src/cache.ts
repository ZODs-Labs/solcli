export interface CacheKey {
  namespace: string;
  call: string;
  params: string;
}

/** Read-through cache for RPC and provider responses. Implemented by S2. */
export interface Cache {
  get<T>(key: CacheKey): Promise<T | undefined>;
  set<T>(key: CacheKey, value: T, ttlSec?: number): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
}
