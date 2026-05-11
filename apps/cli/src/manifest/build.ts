import { type CittyArgSpec, cittyArgsToJsonSchema } from "./zod-to-json-schema.js";

export type StabilityTier = "alpha" | "beta" | "stable";

export interface CommandManifestEntry {
  readonly path: string;
  readonly stability: StabilityTier;
  readonly tags: readonly string[];
  readonly capabilities: readonly string[];
  readonly input: unknown;
  readonly output: unknown;
  readonly examples?: readonly {
    readonly title: string;
    readonly argv: readonly string[];
    readonly stdout?: string;
  }[];
  readonly exitCodes: readonly number[];
  readonly synthesized?: boolean;
  readonly contributedBy?: string;
}

export interface CapabilityManifest {
  readonly schemaVersion: 1;
  readonly cliVersion: string;
  readonly commands: Readonly<Record<string, CommandManifestEntry>>;
}

interface MaybeCommandShape {
  readonly meta?: unknown;
  readonly args?: unknown;
  readonly subCommands?: unknown;
}

interface ResolvedMeta {
  readonly stability: StabilityTier;
  readonly tags: readonly string[];
  readonly capabilities: readonly string[];
  readonly exitCodes: readonly number[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function resolveResolvable<T>(v: unknown): Promise<T | undefined> {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "function") {
    const fn = v as () => unknown;
    return resolveResolvable<T>(fn());
  }
  if (v instanceof Promise) {
    return resolveResolvable<T>(await v);
  }
  return v as T;
}

function isStability(v: unknown): v is StabilityTier {
  return v === "alpha" || v === "beta" || v === "stable";
}

function asStringArray(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function asNumberArray(v: unknown): readonly number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    if (typeof item === "number" && Number.isFinite(item)) out.push(item);
  }
  return out;
}

function readMeta(metaRaw: unknown): ResolvedMeta {
  const meta = isRecord(metaRaw) ? metaRaw : {};
  const stabilityRaw = meta["stability"];
  const stability = isStability(stabilityRaw) ? stabilityRaw : "beta";
  const tags = asStringArray(meta["tags"]);
  const capabilities = asStringArray(meta["capabilities"]);
  const exitCodesRaw = asNumberArray(meta["exitCodes"]);
  const exitCodes = exitCodesRaw.length > 0 ? exitCodesRaw : [0, 2];
  return { stability, tags, capabilities, exitCodes };
}

function defaultOutputSchema(): unknown {
  return {
    type: "object",
    properties: {
      schemaVersion: { const: 1 },
      data: {},
    },
  };
}

function asArgsRecord(v: unknown): Record<string, CittyArgSpec> {
  if (!isRecord(v)) return {};
  const out: Record<string, CittyArgSpec> = {};
  for (const [key, value] of Object.entries(v)) {
    if (isRecord(value)) {
      out[key] = value as CittyArgSpec;
    }
  }
  return out;
}

export function buildCommandEntry(cmdModule: unknown, path: string): CommandManifestEntry {
  const command = unwrapDefault(cmdModule);
  const cmd: MaybeCommandShape = isRecord(command) ? command : {};
  const metaRaw = unwrapResolvableSync(cmd.meta);
  const argsRaw = unwrapResolvableSync(cmd.args);
  const { stability, tags, capabilities, exitCodes } = readMeta(metaRaw);
  const input = cittyArgsToJsonSchema(asArgsRecord(argsRaw));
  const entry: CommandManifestEntry = {
    path,
    stability,
    tags,
    capabilities,
    input,
    output: defaultOutputSchema(),
    exitCodes,
  };
  return entry;
}

function unwrapDefault(mod: unknown): unknown {
  if (isRecord(mod) && "default" in mod) {
    const d = (mod as { default: unknown }).default;
    if (d !== undefined) return d;
  }
  return mod;
}

function unwrapResolvableSync(v: unknown): unknown {
  if (typeof v === "function") {
    try {
      const result = (v as () => unknown)();
      if (result instanceof Promise) return undefined;
      return result;
    } catch {
      return undefined;
    }
  }
  if (v instanceof Promise) return undefined;
  return v;
}

async function processNode(
  raw: unknown,
  path: string,
  out: Record<string, CommandManifestEntry>,
): Promise<void> {
  const node = unwrapDefault(raw);
  if (!isRecord(node)) return;
  const cmd: MaybeCommandShape = node;
  const metaRaw = await resolveResolvable<unknown>(cmd.meta);
  const argsRaw = await resolveResolvable<unknown>(cmd.args);
  const { stability, tags, capabilities, exitCodes } = readMeta(metaRaw);
  const input = cittyArgsToJsonSchema(asArgsRecord(argsRaw));
  out[path] = {
    path,
    stability,
    tags,
    capabilities,
    input,
    output: defaultOutputSchema(),
    exitCodes,
  };
  const subCommandsRaw = await resolveResolvable<unknown>(cmd.subCommands);
  if (!isRecord(subCommandsRaw)) return;
  const subKeys = Object.keys(subCommandsRaw).sort((a, b) => a.localeCompare(b));
  for (const key of subKeys) {
    const childResolvable = subCommandsRaw[key];
    try {
      const child = await resolveResolvable<unknown>(childResolvable);
      await processNode(child, `${path}.${key}`, out);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`build-manifest: skipped ${path}.${key} (${reason})`);
    }
  }
}

export async function buildTree(
  tree: Record<string, () => Promise<unknown>>,
  cliVersion: string,
): Promise<CapabilityManifest> {
  const out: Record<string, CommandManifestEntry> = {};
  const rootKeys = Object.keys(tree).sort((a, b) => a.localeCompare(b));
  for (const key of rootKeys) {
    const loader = tree[key];
    if (loader === undefined) continue;
    try {
      const mod = await loader();
      await processNode(mod, key, out);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`build-manifest: skipped root ${key} (${reason})`);
    }
  }
  const sortedPaths = Object.keys(out).sort((a, b) => a.localeCompare(b));
  const sortedCommands: Record<string, CommandManifestEntry> = {};
  for (const p of sortedPaths) {
    const entry = out[p];
    if (entry !== undefined) sortedCommands[p] = entry;
  }
  return {
    schemaVersion: 1,
    cliVersion,
    commands: sortedCommands,
  };
}
