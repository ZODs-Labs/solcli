import { z } from "zod";

export const LogLevelSchema = z.enum(["trace", "debug", "info", "warn", "error"]);

export const RpcConfigSchema = z.object({
  primary: z.string().url().optional(),
  fallback: z.array(z.string().url()).optional(),
  timeoutMs: z.number().int().positive().default(30_000),
});

export const ProviderVendorConfigSchema = z.object({
  apiKeySecret: z.string().min(1).optional(),
  bearerSecret: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
});

export const ProviderConfigSchema = z.object({
  active: z.string().min(1).default("rpc-only"),
  fallback: z.array(z.string().min(1)).optional(),
  helius: ProviderVendorConfigSchema.optional(),
  triton: ProviderVendorConfigSchema.optional(),
});

export const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttlSecondsDefault: z.number().int().nonnegative().default(300),
});

export const LogConfigSchema = z.object({
  level: LogLevelSchema.default("info"),
  fileMaxSizeMb: z.number().int().positive().default(10),
  fileMaxFiles: z.number().int().positive().default(7),
});

export const ConfigSchema = z.object({
  network: z.string().min(1).default("mainnet-beta"),
  profile: z.string().min(1).default("default"),
  rpc: RpcConfigSchema.default({ timeoutMs: 30_000 }),
  provider: ProviderConfigSchema.default({ active: "rpc-only" }),
  cache: CacheConfigSchema.default({ enabled: true, ttlSecondsDefault: 300 }),
  log: LogConfigSchema.default({ level: "info", fileMaxSizeMb: 10, fileMaxFiles: 7 }),
  noInput: z.boolean().default(false),
  noColor: z.boolean().default(false),
  noUpdateNotifier: z.boolean().default(false),
});

export const ConfigFileSchema = z
  .object({
    default_profile: z.string().min(1).default("default"),
  })
  .catchall(ConfigSchema.partial());
