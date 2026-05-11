import { EventEmitter } from "node:events";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGunzip } from "node:zlib";
import type { Logger, Paths, PluginManifest } from "@solcli/contracts";
import { IoError, PluginInvalidManifestError, PluginUnverifiedError } from "@solcli/errors";
import { computeSha384, verifyIntegrity } from "./integrity.js";
import { verifyPluginManifest } from "./manifest-verifier.js";
import {
  type CommandManifestOverlay,
  createPluginRegistry,
  type PluginRegistry,
} from "./registry.js";

export interface ConfigPluginEntry {
  readonly id: string;
  readonly version: string;
  readonly integrity: string;
  readonly trust: "verified" | "community" | "local";
  readonly path?: string;
  readonly source?: string;
}

export interface ExtensionHostConfigStore {
  read(): Promise<readonly ConfigPluginEntry[]>;
  add(entry: ConfigPluginEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface FetchTarballArgs {
  readonly spec: string;
  readonly version?: string;
  readonly fromPath?: string;
  readonly signal: AbortSignal;
}

export interface ExtractTarballArgs {
  readonly tarballBytes: Uint8Array;
  readonly destDir: string;
  readonly signal: AbortSignal;
}

export interface PluginModuleResolver {
  load(pluginDir: string, manifest: PluginManifest, signal: AbortSignal): Promise<unknown>;
}

export interface ExtensionHostDeps {
  readonly paths: Paths;
  readonly logger: Logger;
  readonly config: ExtensionHostConfigStore;
  readonly registry?: PluginRegistry;
  readonly events?: EventEmitter;
  readonly fetchTarball: (args: FetchTarballArgs) => Promise<Uint8Array>;
  readonly extractTarball: (args: ExtractTarballArgs) => Promise<void>;
  readonly resolver?: PluginModuleResolver;
  readonly clock?: () => number;
}

export interface InstallSpec {
  readonly id: string;
  readonly version?: string;
  readonly fromPath?: string;
  readonly trust: "verified" | "community" | "local";
  readonly expectedIntegrity?: string;
  readonly interactive: boolean;
  readonly yesPermissions?: readonly string[];
  readonly signal: AbortSignal;
}

export interface InstallResult {
  readonly manifest: PluginManifest;
  readonly installedAt: string;
  readonly integrity: string;
  readonly pluginDir: string;
}

export interface ReloadResult {
  readonly loaded: readonly { readonly name: string; readonly version: string }[];
  readonly refused: readonly { readonly name: string; readonly reason: string }[];
}

export interface ExtensionHost {
  install(spec: InstallSpec): Promise<InstallResult>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  reload(signal: AbortSignal): Promise<ReloadResult>;
  listInstalled(): Promise<readonly PluginManifest[]>;
  listManifestOverlays(): readonly CommandManifestOverlay[];
  verifyInstalled(
    id: string,
    signal: AbortSignal,
  ): Promise<{ readonly id: string; readonly integrity: string; readonly ok: boolean }>;
  on(event: "plugin.loaded" | "plugin.refused", listener: (payload: unknown) => void): void;
  registry(): PluginRegistry;
}

const MANIFEST_FILE = "solcli.plugin.json";
const PLUGINS_DIR = "plugins";

function pluginInstallDir(paths: Paths, name: string, version: string): string {
  const safeName = name.replace(/[^A-Za-z0-9._@-]/g, "_").replace(/\//g, "__");
  return path.join(paths.data, PLUGINS_DIR, `${safeName}@${version}`);
}

async function readManifestFromDir(dir: string): Promise<PluginManifest> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, MANIFEST_FILE), "utf8");
  } catch (err: unknown) {
    throw new PluginInvalidManifestError(`Plugin is missing ${MANIFEST_FILE}`, {
      cause: err as Error,
      details: { dir },
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new PluginInvalidManifestError(`Plugin ${MANIFEST_FILE} is not valid JSON`, {
      cause: err as Error,
      details: { dir },
    });
  }
  return verifyPluginManifest(parsed);
}

function commandOverlaysFor(manifest: PluginManifest): readonly CommandManifestOverlay[] {
  const commands = manifest.contributes.commands ?? [];
  return commands.map((command) => ({
    commandPath: command,
    entry: {
      command,
      stability: "alpha",
      tier: manifest.trust === "verified" ? 1 : manifest.trust === "community" ? 2 : 3,
      synthesized: false,
    },
    contributedBy: manifest.name,
  }));
}

function permissionGate(manifest: PluginManifest, spec: InstallSpec): void {
  if (manifest.permissions.signer === "always") {
    const approved = spec.yesPermissions?.includes("signer") === true;
    if (!approved && !spec.interactive) {
      throw new PluginUnverifiedError(
        `Plugin '${manifest.name}' requests permissions.signer=always; pass --yes-permissions=signer to approve in non-interactive mode`,
        {
          details: {
            plugin: manifest.name,
            permission: "signer",
            mode: "always",
          },
        },
      );
    }
  }
}

async function atomicMove(srcDir: string, destDir: string): Promise<void> {
  await mkdir(path.dirname(destDir), { recursive: true });
  // Best-effort cleanup of any prior installation.
  await rm(destDir, { recursive: true, force: true });
  await rename(srcDir, destDir);
}

async function atomicRemoveDir(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.tmp.${process.pid}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmp, payload, { mode: 0o600 });
  await rename(tmp, filePath);
}

export function createExtensionHost(deps: ExtensionHostDeps): ExtensionHost {
  const registry = deps.registry ?? createPluginRegistry();
  const events = deps.events ?? new EventEmitter();
  const clock = deps.clock ?? (() => Date.now());

  async function loadPluginModule(
    pluginDir: string,
    manifest: PluginManifest,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (deps.resolver !== undefined) {
      return deps.resolver.load(pluginDir, manifest, signal);
    }
    return null;
  }

  async function reload(signal: AbortSignal): Promise<ReloadResult> {
    signal.throwIfAborted();
    const entries = await deps.config.read();
    registry.clear();
    const loaded: { name: string; version: string }[] = [];
    const refused: { name: string; reason: string }[] = [];
    for (const entry of entries) {
      signal.throwIfAborted();
      const installDir = entry.path ?? pluginInstallDir(deps.paths, entry.id, entry.version);
      try {
        const manifest = await readManifestFromDir(installDir);
        if (manifest.name !== entry.id) {
          refused.push({
            name: entry.id,
            reason: `manifest name '${manifest.name}' does not match config id '${entry.id}'`,
          });
          events.emit("plugin.refused", { name: entry.id, reason: "name-mismatch" });
          continue;
        }
        if (manifest.version !== entry.version) {
          refused.push({
            name: entry.id,
            reason: `manifest version '${manifest.version}' does not match config version '${entry.version}'`,
          });
          events.emit("plugin.refused", { name: entry.id, reason: "version-mismatch" });
          continue;
        }
        await loadPluginModule(installDir, manifest, signal);
        registry.addContribution(manifest.name, manifest, commandOverlaysFor(manifest));
        loaded.push({ name: manifest.name, version: manifest.version });
        events.emit("plugin.loaded", { name: manifest.name, version: manifest.version });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        refused.push({ name: entry.id, reason });
        events.emit("plugin.refused", { name: entry.id, reason });
        deps.logger.warn({ plugin: entry.id, reason }, "plugin refused during reload");
      }
    }
    return { loaded, refused };
  }

  async function install(spec: InstallSpec): Promise<InstallResult> {
    spec.signal.throwIfAborted();
    if (spec.fromPath === undefined && (spec.version === undefined || spec.version === "")) {
      throw new IoError("Plugin install requires either fromPath or version", {
        details: { id: spec.id },
      });
    }
    const fetchArgs: FetchTarballArgs = {
      spec: spec.id,
      signal: spec.signal,
    };
    if (spec.version !== undefined) {
      Object.assign(fetchArgs, { version: spec.version });
    }
    if (spec.fromPath !== undefined) {
      Object.assign(fetchArgs, { fromPath: spec.fromPath });
    }
    const tarballBytes = await deps.fetchTarball(fetchArgs);
    spec.signal.throwIfAborted();

    const computed = computeSha384(tarballBytes);
    const expected = spec.expectedIntegrity ?? computed;
    verifyIntegrity(tarballBytes, expected);

    const stagingDir = await mkdtemp(path.join(tmpdir(), "solcli-plugin-"));
    try {
      await deps.extractTarball({ tarballBytes, destDir: stagingDir, signal: spec.signal });
      spec.signal.throwIfAborted();
      const manifest = await readManifestFromDir(stagingDir);
      if (manifest.name !== spec.id) {
        throw new PluginInvalidManifestError(
          `Plugin manifest name '${manifest.name}' does not match the requested id '${spec.id}'`,
          { details: { id: spec.id, manifestName: manifest.name } },
        );
      }
      if (spec.version !== undefined && manifest.version !== spec.version) {
        throw new PluginInvalidManifestError(
          `Plugin manifest version '${manifest.version}' does not match the requested version '${spec.version}'`,
          { details: { id: spec.id, manifestVersion: manifest.version, requested: spec.version } },
        );
      }

      permissionGate(manifest, spec);

      const installDir = pluginInstallDir(deps.paths, manifest.name, manifest.version);
      await atomicMove(stagingDir, installDir);

      await deps.config.add({
        id: manifest.name,
        version: manifest.version,
        integrity: computed,
        trust: manifest.trust,
        ...(spec.fromPath !== undefined ? { source: spec.fromPath, path: installDir } : {}),
      });

      registry.addContribution(manifest.name, manifest, commandOverlaysFor(manifest));
      const result: InstallResult = {
        manifest,
        installedAt: new Date(clock()).toISOString(),
        integrity: computed,
        pluginDir: installDir,
      };
      events.emit("plugin.loaded", { name: manifest.name, version: manifest.version });
      // Persist a hash receipt next to the plugin for offline verification.
      await writeJsonAtomic(path.join(installDir, ".integrity.json"), {
        integrity: computed,
        installedAt: result.installedAt,
      });
      return result;
    } catch (err: unknown) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {
        // best-effort
      });
      throw err;
    }
  }

  async function remove(id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const entries = await deps.config.read();
    const match = entries.find((entry) => entry.id === id);
    await deps.config.remove(id);
    registry.removeContribution(id);
    if (match !== undefined) {
      const target = match.path ?? pluginInstallDir(deps.paths, match.id, match.version);
      await atomicRemoveDir(target);
    }
  }

  async function listInstalled(): Promise<readonly PluginManifest[]> {
    const entries = await deps.config.read();
    const out: PluginManifest[] = [];
    for (const entry of entries) {
      const installDir = entry.path ?? pluginInstallDir(deps.paths, entry.id, entry.version);
      try {
        const manifest = await readManifestFromDir(installDir);
        out.push(manifest);
      } catch {
        // Skip plugins whose on-disk state is broken; surfaced separately by verify.
      }
    }
    return out;
  }

  async function verifyInstalled(
    id: string,
    signal: AbortSignal,
  ): Promise<{ id: string; integrity: string; ok: boolean }> {
    signal.throwIfAborted();
    const entries = await deps.config.read();
    const match = entries.find((entry) => entry.id === id);
    if (match === undefined) {
      return { id, integrity: "", ok: false };
    }
    const installDir = match.path ?? pluginInstallDir(deps.paths, match.id, match.version);
    try {
      const manifest = await readManifestFromDir(installDir);
      const ok = manifest.name === match.id && manifest.version === match.version;
      return { id, integrity: manifest.integrity, ok };
    } catch {
      return { id, integrity: "", ok: false };
    }
  }

  return {
    install,
    remove,
    reload,
    listInstalled,
    listManifestOverlays() {
      return registry.listManifestOverlays();
    },
    verifyInstalled,
    on(event, listener) {
      events.on(event, listener);
    },
    registry() {
      return registry;
    },
  };
}

/**
 * Default JSON-backed plugin store. Sits next to the TOML config rather than
 * embedded in it because the project config schema does not (and per H12 for
 * task D1, cannot) take a `[[plugins]]` field. Writes go through the same
 * atomic-rename pattern (`.tmp` + rename) the TOML config uses; readers see
 * either the prior file or the new one, never a partial one.
 */
export function createDefaultPluginConfigStore(paths: Paths): ExtensionHostConfigStore {
  const filePath = path.join(paths.config, "plugins.json");

  async function readAll(): Promise<ConfigPluginEntry[]> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new IoError(`Cannot read plugins registry at ${filePath}`, { cause: err as Error });
    }
    if (raw.trim() === "") return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: unknown) {
      throw new IoError(`Invalid JSON in plugins registry at ${filePath}`, { cause: err as Error });
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { plugins?: unknown }).plugins)
    ) {
      return [];
    }
    return (parsed as { plugins: unknown[] }).plugins.filter(
      (entry): entry is ConfigPluginEntry =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as ConfigPluginEntry).id === "string" &&
        typeof (entry as ConfigPluginEntry).version === "string" &&
        typeof (entry as ConfigPluginEntry).integrity === "string" &&
        typeof (entry as ConfigPluginEntry).trust === "string",
    );
  }

  async function writeAll(entries: readonly ConfigPluginEntry[]): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}`;
    const body = `${JSON.stringify({ schemaVersion: 1, plugins: entries }, null, 2)}\n`;
    await writeFile(tmp, body, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  return {
    async read() {
      return readAll();
    },
    async add(entry) {
      const current = await readAll();
      const next = current.filter((existing) => existing.id !== entry.id);
      next.push(entry);
      next.sort((a, b) => a.id.localeCompare(b.id));
      await writeAll(next);
    },
    async remove(id) {
      const current = await readAll();
      const next = current.filter((existing) => existing.id !== id);
      if (next.length === current.length) return;
      await writeAll(next);
    },
  };
}

async function readStreamToBytes(stream: ReadStream | NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

/**
 * Default tarball fetcher: lazy-loads `undici` only when an npm-style spec is
 * resolved, so `solcli --help` does not pay the cost. Local paths read with
 * `node:fs` and stream the bytes in.
 */
export async function defaultFetchTarball(args: FetchTarballArgs): Promise<Uint8Array> {
  args.signal.throwIfAborted();
  if (args.fromPath !== undefined) {
    const stream = createReadStream(args.fromPath);
    return readStreamToBytes(stream);
  }
  const version = args.version ?? "latest";
  const fetchImpl = globalThis.fetch as unknown as (
    input: string,
    init: { signal: AbortSignal },
  ) => Promise<Response>;
  if (typeof fetchImpl !== "function") {
    throw new IoError("Built-in fetch is unavailable; Node 22 LTS is required");
  }
  const registryUrl = `https://registry.npmjs.org/${args.spec}/${version}`;
  const metaRes = await fetchImpl(registryUrl, { signal: args.signal });
  if (!metaRes.ok) {
    throw new IoError(`npm registry metadata fetch failed (${metaRes.status})`, {
      details: { url: registryUrl },
    });
  }
  const meta = (await metaRes.json()) as { dist?: { tarball?: string } };
  const tarUrl = meta.dist?.tarball;
  if (tarUrl === undefined) {
    throw new IoError("npm registry response missing dist.tarball", {
      details: { spec: args.spec },
    });
  }
  const tarRes = await fetchImpl(tarUrl, { signal: args.signal });
  if (!tarRes.ok) {
    throw new IoError(`npm tarball fetch failed (${tarRes.status})`, { details: { url: tarUrl } });
  }
  return new Uint8Array(await tarRes.arrayBuffer());
}

interface TarHeader {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

function parseTarHeader(buf: Buffer): TarHeader | null {
  if (buf.length < 512) return null;
  let zero = true;
  for (let i = 0; i < 512; i += 1) {
    if (buf[i] !== 0) {
      zero = false;
      break;
    }
  }
  if (zero) return null;
  const prefix = buf.slice(345, 500).toString("utf8").split("\0", 1)[0] ?? "";
  const name = buf.slice(0, 100).toString("utf8").split("\0", 1)[0] ?? "";
  const fullName = prefix === "" ? name : `${prefix}/${name}`;
  const sizeOctal = buf.slice(124, 136).toString("utf8").split("\0", 1)[0] ?? "0";
  const size = Number.parseInt(sizeOctal.trim() || "0", 8);
  const type = buf.slice(156, 157).toString("utf8");
  return { name: fullName, size, type };
}

/**
 * Default tarball extractor. Handles plain or gzip-wrapped tarballs without
 * bringing in a third-party `tar` dep; npm-style "package/" prefixes are
 * stripped so a published tarball lands at `destDir` directly. Path traversal
 * is rejected (entries must stay inside `destDir`).
 */
export async function defaultExtractTarball(args: ExtractTarballArgs): Promise<void> {
  args.signal.throwIfAborted();
  let bytes = Buffer.from(args.tarballBytes);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const gunzip = createGunzip();
    gunzip.end(bytes);
    bytes = Buffer.from(await readStreamToBytes(gunzip));
  }
  await mkdir(args.destDir, { recursive: true });
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const headerBuf = bytes.slice(offset, offset + 512);
    const header = parseTarHeader(headerBuf);
    offset += 512;
    if (header === null) {
      // End of archive (two zero blocks).
      break;
    }
    const dataEnd = offset + header.size;
    if (dataEnd > bytes.length) {
      throw new IoError("Plugin tarball is truncated");
    }
    const stripped = header.name.replace(/^[^/]+\//, "");
    if (stripped === "" || stripped.endsWith("/")) {
      // Directory or pax header; advance and continue.
      offset += Math.ceil(header.size / 512) * 512;
      continue;
    }
    if (header.type !== "0" && header.type !== "" && header.type !== "7") {
      offset += Math.ceil(header.size / 512) * 512;
      continue;
    }
    const target = path.resolve(args.destDir, stripped);
    const rootResolved = path.resolve(args.destDir);
    if (!target.startsWith(rootResolved + path.sep) && target !== rootResolved) {
      throw new IoError(`Plugin tarball entry escapes destination: ${stripped}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    const data = bytes.slice(offset, dataEnd);
    await writeFile(target, data);
    offset += Math.ceil(header.size / 512) * 512;
  }
}

export interface BootstrapArgs {
  readonly paths: Paths;
  readonly logger: Logger;
  readonly fetchOverride?: (args: FetchTarballArgs) => Promise<Uint8Array>;
  readonly extractOverride?: (args: ExtractTarballArgs) => Promise<void>;
}

/**
 * Wire the production-default deps and return a ready-to-use ExtensionHost.
 * Command code uses this; tests construct the host directly through
 * `createExtensionHost` with stubbed deps.
 */
export function bootstrapExtensionHost(args: BootstrapArgs): ExtensionHost {
  return createExtensionHost({
    paths: args.paths,
    logger: args.logger,
    config: createDefaultPluginConfigStore(args.paths),
    fetchTarball: args.fetchOverride ?? defaultFetchTarball,
    extractTarball: args.extractOverride ?? defaultExtractTarball,
  });
}
