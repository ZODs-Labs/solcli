import type { Config } from "@solcli/contracts";

export const DEFAULT_CONFIG: Config = {
  network: "mainnet-beta",
  profile: "default",
  rpc: { timeoutMs: 30_000 },
  provider: { active: "rpc-only" },
  cache: { enabled: true, ttlSecondsDefault: 300 },
  log: { level: "info", fileMaxSizeMb: 10, fileMaxFiles: 7 },
  noInput: false,
  noColor: false,
  noUpdateNotifier: false,
};

export const ENV_VAR_NAMES = {
  NETWORK: "SOLCLI_NETWORK",
  PROFILE: "SOLCLI_PROFILE",
  PROVIDER: "SOLCLI_PROVIDER",
  RPC_PRIMARY: "SOLCLI_RPC_PRIMARY",
  RPC_FALLBACK: "SOLCLI_RPC_FALLBACK",
  RPC_TIMEOUT_MS: "SOLCLI_RPC_TIMEOUT_MS",
  CACHE_ENABLED: "SOLCLI_CACHE_ENABLED",
  CACHE_TTL: "SOLCLI_CACHE_TTL",
  LOG_LEVEL: "SOLCLI_LOG_LEVEL",
  NO_INPUT: "SOLCLI_NO_INPUT",
  NO_COLOR: "NO_COLOR",
  NO_UPDATE_NOTIFIER: "NO_UPDATE_NOTIFIER",
} as const;
