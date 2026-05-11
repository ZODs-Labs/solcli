import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ExecaError, execa } from "execa";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
export const BINARY = path.join(PROJECT_ROOT, "dist", "bin", "solcli.js");

export interface IsolatedEnv {
  dir: string;
  env: NodeJS.ProcessEnv;
}

export async function makeIsolatedEnv(
  overrides: Record<string, string> = {},
): Promise<IsolatedEnv> {
  const dir = await mkdtemp(path.join(tmpdir(), "solcli-it-"));
  for (const sub of ["config", "data", "cache", "state"]) {
    await mkdir(path.join(dir, sub), { recursive: true });
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1",
    NO_COLOR: "1",
    NO_INPUT: "1",
    CI: "true",
    XDG_CONFIG_HOME: path.join(dir, "config"),
    XDG_DATA_HOME: path.join(dir, "data"),
    XDG_CACHE_HOME: path.join(dir, "cache"),
    XDG_STATE_HOME: path.join(dir, "state"),
    HOME: dir,
    LOCALAPPDATA: dir,
    APPDATA: dir,
    SOLCLI_MASTER_KEY: "test-master-key-encrypted-file-fallback",
    ...overrides,
  };
  delete env.DBUS_SESSION_BUS_ADDRESS;
  return { dir, env };
}

export interface RunResult {
  dir: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
  duration: number;
}

export async function runCli(
  args: string[],
  overrides: Record<string, string> = {},
): Promise<RunResult> {
  const { dir, env } = await makeIsolatedEnv(overrides);
  const t0 = Date.now();
  const result = await execa("node", [BINARY, ...args], {
    env,
    reject: false,
    timeout: 30_000,
  });
  return {
    dir,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
    failed: (result.failed ?? false) || (result.exitCode ?? 0) !== 0,
    duration: Date.now() - t0,
  };
}

export function envForDir(dir: string): Record<string, string> {
  return {
    XDG_CONFIG_HOME: path.join(dir, "config"),
    XDG_DATA_HOME: path.join(dir, "data"),
    XDG_CACHE_HOME: path.join(dir, "cache"),
    XDG_STATE_HOME: path.join(dir, "state"),
    HOME: dir,
    LOCALAPPDATA: dir,
    APPDATA: dir,
  };
}

export function isExecaError(e: unknown): e is ExecaError {
  return Boolean(e && typeof e === "object" && "exitCode" in (e as Record<string, unknown>));
}
