import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "@solcli/contracts";
import { ConfigError, IoError } from "@solcli/errors";
import lockfile from "proper-lockfile";
import { parse, stringify } from "smol-toml";
import { ConfigFileSchema } from "./schema.js";

export interface ConfigFile {
  default_profile: string;
  profiles: Record<string, Partial<Config>>;
}

export async function loadTomlConfig(configPath: string): Promise<ConfigFile | null> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new IoError(`Cannot read config at ${configPath}`, { cause: err as Error });
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    throw new ConfigError(`Invalid TOML at ${configPath}: ${(err as Error).message}`, {
      cause: err as Error,
    });
  }

  const result = ConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `Config schema validation failed: ${result.error.issues.map((i) => i.message).join("; ")}`,
      { details: { issues: result.error.issues } },
    );
  }

  const profiles: Record<string, Partial<Config>> = {};
  for (const [k, v] of Object.entries(result.data)) {
    if (k === "default_profile") continue;
    profiles[k] = v as Partial<Config>;
  }

  return {
    default_profile: result.data.default_profile,
    profiles,
  };
}

export async function saveTomlConfig(configPath: string, file: ConfigFile): Promise<void> {
  const dir = path.dirname(configPath);
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    throw new IoError(`Cannot create config dir ${dir}`, { cause: err as Error });
  }

  try {
    await readFile(configPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await writeFile(configPath, "", { mode: 0o600 });
    }
  }

  const release = await lockfile.lock(configPath, {
    retries: { retries: 5, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 5_000,
  });

  try {
    const toml = serializeConfigFile(file);
    const tmpPath = `${configPath}.tmp.${process.pid}`;
    await writeFile(tmpPath, toml, { mode: 0o600 });
    await rename(tmpPath, configPath);
    if (process.platform !== "win32") {
      await chmod(configPath, 0o600).catch(() => {
        // best effort on POSIX
      });
    }
  } catch (err: unknown) {
    throw new IoError(`Failed to write config at ${configPath}`, { cause: err as Error });
  } finally {
    await release();
  }
}

function serializeConfigFile(file: ConfigFile): string {
  const obj: Record<string, unknown> = { default_profile: file.default_profile };
  for (const [name, partial] of Object.entries(file.profiles)) {
    obj[name] = partial;
  }
  return stringify(obj);
}
