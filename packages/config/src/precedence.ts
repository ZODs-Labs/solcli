import type { Config } from "@solcli/contracts";
import { DEFAULT_CONFIG, ENV_VAR_NAMES } from "./defaults.js";
import { LogLevelSchema } from "./schema.js";

export function deepMerge<T extends Record<string, unknown>>(
  ...sources: Array<Partial<T> | undefined>
): T {
  const out: Record<string, unknown> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      if (value === undefined) continue;
      const prev = out[key];
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        prev !== null &&
        prev !== undefined &&
        typeof prev === "object" &&
        !Array.isArray(prev)
      ) {
        out[key] = deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
  }
  return out as T;
}

export function envOverrides(env: NodeJS.ProcessEnv = process.env): Partial<Config> {
  const out: Partial<Config> = {};
  const v = (k: string): string | undefined => {
    const x = env[k];
    return x !== undefined && x !== "" ? x : undefined;
  };

  const network = v(ENV_VAR_NAMES.NETWORK);
  if (network !== undefined) out.network = network;

  const profile = v(ENV_VAR_NAMES.PROFILE);
  if (profile !== undefined) out.profile = profile;

  const providerActive = v(ENV_VAR_NAMES.PROVIDER);
  if (providerActive !== undefined) {
    out.provider = { active: providerActive };
  }

  const rpcPrimary = v(ENV_VAR_NAMES.RPC_PRIMARY);
  const rpcFallback = v(ENV_VAR_NAMES.RPC_FALLBACK);
  const rpcTimeout = v(ENV_VAR_NAMES.RPC_TIMEOUT_MS);
  if (rpcPrimary !== undefined || rpcFallback !== undefined || rpcTimeout !== undefined) {
    const rpc: Config["rpc"] = {
      timeoutMs: rpcTimeout !== undefined ? parsePositiveInt(rpcTimeout) : 30_000,
    };
    if (rpcPrimary !== undefined) rpc.primary = rpcPrimary;
    if (rpcFallback !== undefined) {
      rpc.fallback = rpcFallback
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    out.rpc = rpc;
  }

  const cacheEnabled = v(ENV_VAR_NAMES.CACHE_ENABLED);
  const cacheTtl = v(ENV_VAR_NAMES.CACHE_TTL);
  if (cacheEnabled !== undefined || cacheTtl !== undefined) {
    out.cache = {
      enabled: cacheEnabled === undefined ? true : cacheEnabled === "true" || cacheEnabled === "1",
      ttlSecondsDefault: cacheTtl !== undefined ? parseNonNegativeInt(cacheTtl) : 300,
    };
  }

  const logLevel = v(ENV_VAR_NAMES.LOG_LEVEL);
  if (logLevel !== undefined) {
    const parsed = LogLevelSchema.safeParse(logLevel);
    if (!parsed.success) return out;
    out.log = {
      level: parsed.data,
      fileMaxSizeMb: 10,
      fileMaxFiles: 7,
    };
  }

  if (v(ENV_VAR_NAMES.NO_INPUT) !== undefined) out.noInput = true;
  if (v(ENV_VAR_NAMES.NO_COLOR) !== undefined) out.noColor = true;
  if (v(ENV_VAR_NAMES.NO_UPDATE_NOTIFIER) !== undefined) out.noUpdateNotifier = true;

  return out;
}

function parsePositiveInt(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30_000;
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 300;
}

export function resolveConfig(opts: {
  fileConfig?: Partial<Config>;
  envOverrides?: Partial<Config>;
  flags?: Partial<Config>;
}): Config {
  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    opts.fileConfig as Record<string, unknown> | undefined,
    opts.envOverrides as Record<string, unknown> | undefined,
    opts.flags as Record<string, unknown> | undefined,
  ) as unknown as Config;
}
