import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { IoError } from "@solcli/errors";

export interface PathPluginEntry {
  readonly name: string;
  readonly binary: string;
}

export interface FsAdapter {
  readdir(dir: string): Promise<readonly string[]>;
  stat(file: string): Promise<{ readonly isFile: boolean; readonly mode: number }>;
}

const defaultFsAdapter: FsAdapter = {
  readdir: async (dir) => readdir(dir),
  stat: async (file) => {
    const s: Stats = await stat(file);
    return { isFile: s.isFile(), mode: s.mode };
  },
};

const NAME_PATTERN = /^solcli-([a-z0-9-]+)$/;

function isWindows(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

function splitPath(rawPath: string | undefined, platform: NodeJS.Platform): readonly string[] {
  if (rawPath === undefined || rawPath === "") return [];
  const sep = isWindows(platform) ? ";" : ":";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawPath.split(sep)) {
    if (raw === "") continue;
    const normalized = path.normalize(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function pathExts(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): readonly string[] {
  if (!isWindows(platform)) return [""];
  const raw = env["PATHEXT"];
  if (raw === undefined || raw === "") return [".COM", ".EXE", ".BAT", ".CMD"];
  return raw.split(";").map((e) => e.toUpperCase());
}

function matchesName(file: string, ext: string): string | null {
  const lower = file.toLowerCase();
  const extLower = ext.toLowerCase();
  let base: string;
  if (ext === "") {
    base = file;
  } else if (lower.endsWith(extLower)) {
    base = file.slice(0, file.length - ext.length);
  } else {
    return null;
  }
  const match = NAME_PATTERN.exec(base);
  if (match === null) return null;
  const name = match[1] as string;
  if (name === "" || name === "plugin") return null;
  return name;
}

export interface DiscoverOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly fs?: FsAdapter;
}

/**
 * Walks `$PATH` (deduplicated and normalized) and returns the executables
 * matching the `solcli-<name>` pattern. On Windows, files with extensions
 * listed in `%PATHEXT%` (default COM/EXE/BAT/CMD) are also returned. The
 * `solcli` binary itself is excluded. Discovery is best-effort: missing or
 * unreadable directories are silently skipped.
 */
export async function discoverPathPlugins(
  opts: DiscoverOptions = {},
): Promise<readonly PathPluginEntry[]> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const fsAdapter = opts.fs ?? defaultFsAdapter;
  const exts = pathExts(env, platform);
  const out = new Map<string, PathPluginEntry>();
  for (const dir of splitPath(env["PATH"], platform)) {
    let entries: readonly string[];
    try {
      entries = await fsAdapter.readdir(dir);
    } catch {
      continue;
    }
    for (const fileName of entries) {
      for (const ext of exts) {
        const name = matchesName(fileName, ext);
        if (name === null) continue;
        const full = path.join(dir, fileName);
        let st: { isFile: boolean; mode: number };
        try {
          st = await fsAdapter.stat(full);
        } catch {
          continue;
        }
        if (!st.isFile) continue;
        if (!isWindows(platform)) {
          // POSIX: must have at least one executable bit set somewhere.
          if ((st.mode & 0o111) === 0) continue;
        }
        if (!out.has(name)) {
          out.set(name, { name, binary: full });
        }
        break;
      }
    }
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface ExecutePathPluginOptions {
  readonly signal: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxBuffer?: number;
}

export interface ExecutePathPluginResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Run a PATH-discovered plugin binary. Always uses execFile with array args
 * (no shell), windowsHide true, an explicit timeout, an explicit maxBuffer
 * and an AbortSignal so SIGINT/SIGTERM propagate.
 */
export function executePathPlugin(
  binary: string,
  argv: readonly string[],
  opts: ExecutePathPluginOptions,
): Promise<ExecutePathPluginResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      argv.slice(),
      {
        env: opts.env ?? process.env,
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
        windowsHide: true,
        signal: opts.signal,
      },
      (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const exitCode = typeof child.exitCode === "number" ? child.exitCode : err === null ? 0 : 1;
        if (err !== null && err.name === "AbortError") {
          reject(err);
          return;
        }
        if (err !== null && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new IoError(`PATH-discovered plugin binary not found: ${binary}`, {
              cause: err,
              details: { binary },
            }),
          );
          return;
        }
        resolve({
          exitCode,
          stdout: typeof stdout === "string" ? stdout : Buffer.from(stdout).toString("utf8"),
          stderr: typeof stderr === "string" ? stderr : Buffer.from(stderr).toString("utf8"),
        });
      },
    );
  });
}
