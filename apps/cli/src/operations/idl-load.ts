import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { AnchorIdl, Pubkey } from "@solcli/contracts";
import { IdlNotFoundError, IoError, ValidationError } from "@solcli/errors";
import type { Context } from "../context.js";
import {
  type SynthesizedCommand,
  type SynthesizedCommandOutcome,
  synthesizeCommands,
} from "../extensions/idl-synth.js";
import type { CommandManifestOverlay } from "../extensions/registry.js";

export interface IdlEntry {
  readonly programId: string;
  readonly label: string;
  readonly instructionCount: number;
  readonly path: string;
  readonly digest: string;
}

export interface IdlAddInput {
  readonly programId: string;
  readonly fromPath?: string;
  readonly label?: string;
}

export interface IdlAddResult {
  readonly programId: string;
  readonly label: string;
  readonly path: string;
  readonly digest: string;
  readonly instructions: readonly string[];
  readonly synthesized: readonly { readonly path: string; readonly stability: "alpha" }[];
  readonly overlays: readonly CommandManifestOverlay[];
}

export interface IdlCallInput {
  readonly programIdOrLabel: string;
  readonly ix: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly signer?: string;
  readonly simulate: boolean;
  readonly execute: boolean;
  readonly idempotencyKey?: string;
}

export interface IdlListResult {
  readonly count: number;
  readonly entries: readonly IdlEntry[];
}

export interface IdlRemoveResult {
  readonly programId: string;
  readonly label: string;
  readonly path: string;
}

const LABELS_FILENAME = "labels.json";

export function idlsDir(ctx: Context): string {
  return path.join(ctx.paths.data, "idls");
}

export function idlCachePath(ctx: Context, programId: string): string {
  if (!isSafeProgramId(programId)) {
    throw new ValidationError(`Invalid program id: ${programId}`);
  }
  return path.join(idlsDir(ctx), `${programId}.json`);
}

export function labelsPath(ctx: Context): string {
  return path.join(idlsDir(ctx), LABELS_FILENAME);
}

/**
 * Validates the IDL, writes it atomically to the cache directory and synthesizes
 * the alpha-tier commands so callers can list them in the success envelope.
 */
export async function idlAdd(ctx: Context, input: IdlAddInput): Promise<IdlAddResult> {
  const programId = input.programId;
  if (!isSafeProgramId(programId)) {
    throw new ValidationError(`Invalid program id: ${programId}`);
  }
  const dir = idlsDir(ctx);
  await mkdir(dir, { recursive: true });

  const idl = await loadIdl(ctx, programId, input.fromPath);
  validateIdl(idl);

  const target = idlCachePath(ctx, programId);
  const body = JSON.stringify(idl, null, 2);
  await atomicWriteFile(target, body);
  const digest = sha256Base64(body);

  const labels = await readLabels(ctx);
  const label = input.label ?? labels[programId] ?? idl.metadata?.name ?? shortLabel(programId);
  if (input.label !== undefined) {
    labels[programId] = input.label;
    await writeLabels(ctx, labels);
  }

  const commands = synthesizeCommands(idl, { programLabel: label, programId });
  const overlays = overlaysForSynthesizedIdl(programId, commands);
  tryRegisterIdlOverlays(ctx, programId, overlays);
  return {
    programId,
    label,
    path: target,
    digest,
    instructions: Object.freeze(idl.instructions.map((i) => i.name)),
    synthesized: Object.freeze(commands.map((c) => ({ path: c.path, stability: c.stability }))),
    overlays,
  };
}

/**
 * Builds CommandManifestOverlay records for each synthesized command so the
 * manifest runtime can surface them under `solcli manifest --include-alpha`.
 * Returned by idlAdd and re-derived inside the manifest layer at boot from
 * the cached IDLs.
 */
export function overlaysForSynthesizedIdl(
  programId: string,
  commands: readonly SynthesizedCommand[],
): readonly CommandManifestOverlay[] {
  const contributedBy = `idl:${programId}`;
  return Object.freeze(
    commands.map<CommandManifestOverlay>((c) => ({
      commandPath: c.path,
      entry: {
        command: c.path,
        stability: c.stability,
        tier: 1,
        synthesized: true,
        description: c.description,
      },
      contributedBy,
    })),
  );
}

function tryRegisterIdlOverlays(
  ctx: Context,
  programId: string,
  overlays: readonly CommandManifestOverlay[],
): void {
  const candidate = (ctx as unknown as { readonly extensions?: { readonly plugins?: unknown } })
    .extensions?.plugins;
  if (candidate === undefined || candidate === null) return;
  const view = candidate as {
    readonly addContribution?: (
      name: string,
      manifest: unknown,
      overlays: readonly CommandManifestOverlay[],
    ) => void;
  };
  if (typeof view.addContribution !== "function") return;
  const synthManifest: unknown = {
    schemaVersion: 1,
    name: `idl:${programId}`,
    version: "0.0.0",
    trust: "local",
    integrity: "",
    permissions: { ports: [], network: [], signer: "never" },
    contributes: {},
  };
  view.addContribution(`idl:${programId}`, synthManifest, overlays);
}

/**
 * Lists every cached IDL with its label and instruction count.
 */
export async function idlList(ctx: Context): Promise<IdlListResult> {
  const dir = idlsDir(ctx);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      return { count: 0, entries: Object.freeze([]) };
    }
    throw new IoError(`Unable to read IDL cache directory: ${dir}`, {
      details: { dir, cause: (err as Error).message ?? String(err) },
    });
  }
  const labels = await readLabels(ctx);
  const entries: IdlEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === LABELS_FILENAME) continue;
    const programId = name.slice(0, -".json".length);
    if (!isSafeProgramId(programId)) continue;
    const filePath = path.join(dir, name);
    let body: string;
    try {
      body = await readFile(filePath, "utf8");
    } catch (err: unknown) {
      if (isFileNotFound(err)) continue;
      throw new IoError(`Unable to read IDL file: ${filePath}`, {
        details: { path: filePath },
      });
    }
    let parsed: AnchorIdl;
    try {
      parsed = JSON.parse(body) as AnchorIdl;
    } catch {
      continue;
    }
    const label = labels[programId] ?? parsed.metadata?.name ?? shortLabel(programId);
    entries.push({
      programId,
      label,
      instructionCount: parsed.instructions.length,
      path: filePath,
      digest: sha256Base64(body),
    });
  }
  return { count: entries.length, entries: Object.freeze(entries) };
}

/**
 * Resolves the IDL by program-id or label, synthesizes the requested
 * instruction and either returns the TransactionPlan or dispatches it via
 * ctx.ops when --simulate or --execute is passed.
 */
export async function idlCall(
  ctx: Context,
  input: IdlCallInput,
): Promise<SynthesizedCommandOutcome> {
  const programId = await resolveProgramId(ctx, input.programIdOrLabel);
  const idl = await readCachedIdl(ctx, programId);
  const labels = await readLabels(ctx);
  const label = labels[programId] ?? idl.metadata?.name ?? shortLabel(programId);
  const commands = synthesizeCommands(idl, { programLabel: label, programId });
  const wanted = input.ix.toLowerCase();
  const cmd: SynthesizedCommand | undefined = commands.find((c) => c.path.endsWith(`.${wanted}`));
  if (!cmd) {
    throw new IdlNotFoundError(`Instruction '${input.ix}' not found in IDL for ${programId}`, {
      details: { programId, instruction: input.ix, available: commands.map((c) => c.path) },
    });
  }
  const flags: Record<string, unknown> = { ...input.args };
  if (input.signer !== undefined) flags["signer"] = input.signer;
  if (input.idempotencyKey !== undefined) flags["idempotency-key"] = input.idempotencyKey;
  flags["simulate"] = input.simulate;
  flags["execute"] = input.execute;
  return cmd.handler(toHandlerContext(ctx), Object.freeze(flags));
}

/**
 * Atomically removes the cached IDL file. The label entry, if any, is cleared.
 */
export async function idlRemove(
  ctx: Context,
  input: { readonly programIdOrLabel: string },
): Promise<IdlRemoveResult> {
  const programId = await resolveProgramId(ctx, input.programIdOrLabel);
  const target = idlCachePath(ctx, programId);
  const labels = await readLabels(ctx);
  const label = labels[programId] ?? shortLabel(programId);
  try {
    await unlink(target);
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      throw new IdlNotFoundError(`IDL not cached for program ${programId}`, {
        details: { programId, path: target },
      });
    }
    throw new IoError(`Unable to remove IDL file: ${target}`, {
      details: { path: target, cause: (err as Error).message ?? String(err) },
    });
  }
  if (programId in labels) {
    delete labels[programId];
    await writeLabels(ctx, labels);
  }
  return { programId, label, path: target };
}

async function loadIdl(
  ctx: Context,
  programId: string,
  fromPath: string | undefined,
): Promise<AnchorIdl> {
  if (fromPath !== undefined && fromPath !== "") {
    let raw: string;
    try {
      raw = await readFile(fromPath, "utf8");
    } catch (err: unknown) {
      throw new IoError(`Unable to read IDL file: ${fromPath}`, {
        details: { path: fromPath, cause: (err as Error).message ?? String(err) },
      });
    }
    try {
      return JSON.parse(raw) as AnchorIdl;
    } catch (err: unknown) {
      throw new ValidationError(`IDL file is not valid JSON: ${fromPath}`, {
        details: { path: fromPath, cause: (err as Error).message ?? String(err) },
      });
    }
  }
  const fetcher = await resolveIdlFetcher(ctx);
  if (!fetcher) {
    throw new IdlNotFoundError(
      `No on-chain IDL fetcher available; pass --from-path to load the IDL from disk for ${programId}`,
      { details: { programId } },
    );
  }
  return fetcher(programId as Pubkey, { signal: ctx.abortController.signal });
}

async function readCachedIdl(ctx: Context, programId: string): Promise<AnchorIdl> {
  const target = idlCachePath(ctx, programId);
  let body: string;
  try {
    body = await readFile(target, "utf8");
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      throw new IdlNotFoundError(`No cached IDL for program ${programId}`, {
        details: { programId, path: target },
      });
    }
    throw new IoError(`Unable to read cached IDL: ${target}`, {
      details: { path: target, cause: (err as Error).message ?? String(err) },
    });
  }
  try {
    return JSON.parse(body) as AnchorIdl;
  } catch (err: unknown) {
    throw new ValidationError(`Cached IDL is not valid JSON: ${target}`, {
      details: { path: target, cause: (err as Error).message ?? String(err) },
    });
  }
}

async function resolveProgramId(ctx: Context, programIdOrLabel: string): Promise<string> {
  if (isSafeProgramId(programIdOrLabel)) {
    return programIdOrLabel;
  }
  const labels = await readLabels(ctx);
  for (const [pid, label] of Object.entries(labels)) {
    if (label === programIdOrLabel) return pid;
  }
  // Fall back to a scan of the cache dir; the IDL metadata.name may match.
  const listing = await idlList(ctx);
  for (const entry of listing.entries) {
    if (entry.label === programIdOrLabel) return entry.programId;
  }
  throw new IdlNotFoundError(`No IDL matches '${programIdOrLabel}'`, {
    details: { input: programIdOrLabel },
  });
}

async function readLabels(ctx: Context): Promise<Record<string, string>> {
  const filePath = labelsPath(ctx);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    if (isFileNotFound(err)) return {};
    throw new IoError(`Unable to read IDL labels: ${filePath}`, {
      details: { path: filePath, cause: (err as Error).message ?? String(err) },
    });
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeLabels(ctx: Context, labels: Record<string, string>): Promise<void> {
  const filePath = labelsPath(ctx);
  await mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteFile(filePath, JSON.stringify(labels, null, 2));
}

function validateIdl(idl: unknown): asserts idl is AnchorIdl {
  if (idl === null || typeof idl !== "object") {
    throw new ValidationError("IDL must be a JSON object");
  }
  const obj = idl as Record<string, unknown>;
  if (!Array.isArray(obj["instructions"])) {
    throw new ValidationError("IDL must declare an 'instructions' array");
  }
  for (const ix of obj["instructions"]) {
    if (ix === null || typeof ix !== "object") {
      throw new ValidationError("Each IDL instruction must be an object");
    }
    const i = ix as Record<string, unknown>;
    if (typeof i["name"] !== "string" || i["name"] === "") {
      throw new ValidationError("IDL instruction is missing a name");
    }
    if (!Array.isArray(i["accounts"])) {
      throw new ValidationError(`IDL instruction '${String(i["name"])}' is missing accounts array`);
    }
    if (!Array.isArray(i["args"])) {
      throw new ValidationError(`IDL instruction '${String(i["name"])}' is missing args array`);
    }
  }
}

async function resolveIdlFetcher(ctx: Context): Promise<IdlFetcher | null> {
  const fromOps = (ctx as unknown as { ops?: { idlFetch?: IdlFetcher } }).ops?.idlFetch;
  if (typeof fromOps === "function") return fromOps;
  const fromCtx = (ctx as unknown as { ports?: { idlFetch?: { fetch?: IdlFetcher } } }).ports
    ?.idlFetch?.fetch;
  if (typeof fromCtx === "function") return fromCtx;
  return null;
}

type IdlFetcher = (
  programId: Pubkey,
  opts: { signal: AbortSignal; fromPath?: string },
) => Promise<AnchorIdl>;

function toHandlerContext(ctx: Context): SynthesizerHandlerContextView {
  const ops = ctx.ops as unknown as { readonly txExecute?: HandlerTxExecute };
  const opsView: { txExecute?: HandlerTxExecute } = {};
  if (typeof ops?.txExecute === "function") {
    opsView.txExecute = ops.txExecute;
  }
  return {
    logger: ctx.logger,
    abortController: ctx.abortController,
    output: ctx.output,
    ops: opsView,
  };
}

type HandlerTxExecute = (
  plan: unknown,
  opts: {
    readonly signal: AbortSignal;
    readonly idempotencyKey: string;
    readonly signerAlias: string;
    readonly simulate: boolean;
    readonly execute: boolean;
  },
) => Promise<unknown>;

interface SynthesizerHandlerContextView {
  readonly logger: Context["logger"];
  readonly abortController: AbortController;
  readonly output: Context["output"];
  readonly ops: { readonly txExecute?: HandlerTxExecute };
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT");
}

function isSafeProgramId(value: string): boolean {
  if (typeof value !== "string" || value.length < 32 || value.length > 64) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

function shortLabel(programId: string): string {
  return programId.slice(0, 8).toLowerCase();
}

function sha256Base64(value: string): string {
  return `sha256-${createHash("sha256").update(value).digest("base64")}`;
}

/**
 * Cross-platform atomic write: tmp file in the same directory, fsync, rename.
 */
export async function atomicWriteFile(target: string, body: string): Promise<void> {
  const dir = path.dirname(target);
  await mkdir(dir, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const tmp = `${target}.tmp.${suffix}`;
  const handle = await open(tmp, "w", 0o600);
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, target);
}
