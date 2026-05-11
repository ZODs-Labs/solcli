import type { LogLevel } from "./logger.js";

export type { LogLevel };

export interface RpcConfig {
  primary?: string;
  fallback?: string[];
  timeoutMs: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttlSecondsDefault: number;
}

export interface LogConfig {
  level: LogLevel;
  fileMaxSizeMb: number;
  fileMaxFiles: number;
}

export interface ProviderConfig {
  active: string;
}

export interface Config {
  network: string;
  profile: string;
  rpc: RpcConfig;
  provider: ProviderConfig;
  cache: CacheConfig;
  log: LogConfig;
  noInput: boolean;
  noColor: boolean;
  noUpdateNotifier: boolean;
}

/** Layered config: defaults < file < env vars < CLI flags. Implemented by S1. */
export interface ConfigManager {
  resolve(cliFlags: Partial<Config>): Config;
  read(): Config;
  set(key: string, value: unknown): Promise<void>;
  get(key: string): unknown;
  switchProfile(name: string): Promise<void>;
  activeProfile(): string;
  configPath(): string;
}
