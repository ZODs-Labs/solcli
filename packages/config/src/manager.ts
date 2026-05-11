import path from "node:path";
import type { Config, ConfigManager, Paths } from "@solcli/contracts";
import { ConfigError } from "@solcli/errors";
import { DEFAULT_CONFIG } from "./defaults.js";
import { type ConfigFile, loadTomlConfig, updateTomlConfig } from "./loader.js";
import { deepMerge, envOverrides, resolveConfig } from "./precedence.js";

export interface ConfigManagerOptions {
  paths: Paths;
  env?: NodeJS.ProcessEnv;
}

export class FileConfigManager implements ConfigManager {
  private readonly paths: Paths;
  private readonly env: NodeJS.ProcessEnv;
  private readonly path: string;
  private cachedFile: ConfigFile | null = null;
  private currentProfile = "default";

  constructor(opts: ConfigManagerOptions) {
    this.paths = opts.paths;
    this.env = opts.env ?? process.env;
    this.path = path.join(this.paths.config, "config.toml");
  }

  configPath(): string {
    return this.path;
  }

  activeProfile(): string {
    return this.currentProfile;
  }

  async init(): Promise<void> {
    this.cachedFile = await loadTomlConfig(this.path);
    const envProfile = this.env["SOLCLI_PROFILE"];
    if (envProfile !== undefined && envProfile !== "") {
      this.currentProfile = envProfile;
    } else if (this.cachedFile?.default_profile) {
      this.currentProfile = this.cachedFile.default_profile;
    } else {
      this.currentProfile = "default";
    }
  }

  read(): Config {
    const fileConfig = this.flattenedFileConfig();
    return resolveConfig({
      ...(fileConfig !== undefined ? { fileConfig } : {}),
      envOverrides: envOverrides(this.env),
    });
  }

  resolve(cliFlags: Partial<Config>): Config {
    const fileConfig = this.flattenedFileConfig();
    return resolveConfig({
      ...(fileConfig !== undefined ? { fileConfig } : {}),
      envOverrides: envOverrides(this.env),
      flags: cliFlags,
    });
  }

  get(key: string): unknown {
    return readDottedPath(this.read() as unknown as Record<string, unknown>, key);
  }

  async set(key: string, value: unknown): Promise<void> {
    const next = await updateTomlConfig(this.path, (current) => {
      const file: ConfigFile = current ?? {
        default_profile: this.currentProfile,
        profiles: {},
      };
      if (key === "default_profile") {
        file.default_profile = String(value);
        return file;
      }
      const profile = file.profiles[this.currentProfile] ?? {};
      writeDottedPath(profile as Record<string, unknown>, key, value);
      file.profiles[this.currentProfile] = profile;
      return file;
    });
    this.cachedFile = next;
  }

  async switchProfile(name: string): Promise<void> {
    if (!name || typeof name !== "string") {
      throw new ConfigError(`Invalid profile name: ${String(name)}`);
    }
    const next = await updateTomlConfig(this.path, (current) => {
      const file: ConfigFile = current ?? {
        default_profile: this.currentProfile,
        profiles: {},
      };
      file.default_profile = name;
      if (!(name in file.profiles)) {
        file.profiles[name] = {};
      }
      return file;
    });
    this.cachedFile = next;
    this.currentProfile = name;
  }

  private flattenedFileConfig(): Partial<Config> | undefined {
    if (!this.cachedFile) return undefined;
    const def = this.cachedFile.profiles["default"] ?? {};
    if (this.currentProfile === "default") return def;
    const profile = this.cachedFile.profiles[this.currentProfile] ?? {};
    return deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      def as Record<string, unknown>,
      profile as Record<string, unknown>,
    ) as unknown as Partial<Config>;
  }
}

function readDottedPath(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function writeDottedPath(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i] as string;
    const existing = cur[p];
    if (existing === undefined || existing === null || typeof existing !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1] as string] = value;
}

export async function createConfigManager(opts: ConfigManagerOptions): Promise<ConfigManager> {
  const mgr = new FileConfigManager(opts);
  await mgr.init();
  return mgr;
}
