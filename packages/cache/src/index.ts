import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Cache, CacheKey, Paths } from "@solcli/contracts";
import { IoError } from "@solcli/errors";
import { LRUCache } from "lru-cache";

export interface TwoTierCacheOptions {
  paths: Paths;
  enabled?: boolean;
  ttlSecondsDefault?: number;
  maxItems?: number;
  maxDiskItems?: number;
}

interface DiskEntry<T> {
  value: T;
  expiresAt: number;
}

interface MemEntry {
  value: unknown;
}

export class TwoTierCache implements Cache {
  private readonly enabled: boolean;
  private readonly defaultTtl: number;
  private readonly maxDiskItems: number;
  private readonly lru: LRUCache<string, MemEntry>;
  private readonly diskRoot: string;

  constructor(opts: TwoTierCacheOptions) {
    this.enabled = opts.enabled ?? true;
    this.defaultTtl = opts.ttlSecondsDefault ?? 300;
    this.maxDiskItems = opts.maxDiskItems ?? opts.maxItems ?? 500;
    this.diskRoot = path.join(opts.paths.cache, "data");
    this.lru = new LRUCache<string, MemEntry>({
      max: opts.maxItems ?? 500,
      ttl: this.defaultTtl * 1000,
    });
  }

  private hashKey(key: CacheKey): string {
    const k = JSON.stringify({ n: key.namespace, c: key.call, p: key.params });
    return createHash("sha256").update(k).digest("hex");
  }

  private diskPath(hash: string): string {
    return path.join(this.diskRoot, `${hash}.json`);
  }

  async get<T>(key: CacheKey): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    const hash = this.hashKey(key);
    const mem = this.lru.get(hash);
    if (mem !== undefined) return mem.value as T;
    let raw: string;
    try {
      raw = await readFile(this.diskPath(hash), "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new IoError("Cache read failed", { cause: err as Error });
    }
    try {
      const parsed = JSON.parse(raw) as DiskEntry<T>;
      if (parsed.expiresAt !== 0 && parsed.expiresAt < Date.now()) {
        await this.deleteByHash(hash);
        return undefined;
      }
      this.lru.set(hash, { value: parsed.value });
      return parsed.value;
    } catch (err: unknown) {
      if (err instanceof IoError) throw err;
      await this.deleteByHash(hash);
      return undefined;
    }
  }

  async set<T>(key: CacheKey, value: T, ttlSec?: number): Promise<void> {
    if (!this.enabled) return;
    const hash = this.hashKey(key);
    const ttl = ttlSec ?? this.defaultTtl;
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    if (ttl > 0) {
      this.lru.set(hash, { value }, { ttl: ttl * 1000 });
    } else {
      this.lru.set(hash, { value });
    }
    const entry: DiskEntry<T> = { value, expiresAt };
    try {
      await mkdir(this.diskRoot, { recursive: true });
      const file = this.diskPath(hash);
      const tmp = `${file}.tmp.${process.pid}`;
      await writeFile(tmp, JSON.stringify(entry), { mode: 0o600 });
      await rename(tmp, file);
      await this.pruneDisk();
    } catch (err: unknown) {
      throw new IoError("Cache write failed", { cause: err as Error });
    }
  }

  async delete(key: CacheKey): Promise<void> {
    if (!this.enabled) return;
    const hash = this.hashKey(key);
    this.lru.delete(hash);
    await this.deleteByHash(hash);
  }

  async clear(): Promise<void> {
    this.lru.clear();
    try {
      await rm(this.diskRoot, { recursive: true, force: true });
    } catch (err: unknown) {
      throw new IoError("Cache clear failed", { cause: err as Error });
    }
  }

  private async deleteByHash(hash: string): Promise<void> {
    try {
      await unlink(this.diskPath(hash));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new IoError("Cache delete failed", { cause: err as Error });
      }
    }
  }

  private async pruneDisk(): Promise<void> {
    if (this.maxDiskItems <= 0) return;
    let entries: string[];
    try {
      entries = await readdir(this.diskRoot);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    const files = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const file = path.join(this.diskRoot, entry);
          return { file, mtimeMs: (await stat(file)).mtimeMs };
        }),
    );
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(files.slice(this.maxDiskItems).map((entry) => unlink(entry.file)));
  }
}

export function createCache(opts: TwoTierCacheOptions): Cache {
  return new TwoTierCache(opts);
}
