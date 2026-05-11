import { readFile } from "node:fs/promises";
import type { CapabilityManifest, CommandManifestEntry } from "./build.js";

const MANIFEST_URL = new URL("../generated/manifest.json", import.meta.url);

export interface LoadManifestOptions {
  readonly pluginOverlay?: ReadonlyArray<CommandManifestEntry>;
  readonly includeAlpha?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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

function isStability(v: unknown): v is "alpha" | "beta" | "stable" {
  return v === "alpha" || v === "beta" || v === "stable";
}

function coerceEntry(raw: unknown): CommandManifestEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const path = raw["path"];
  const stability = raw["stability"];
  if (typeof path !== "string") return undefined;
  if (!isStability(stability)) return undefined;
  const examplesRaw = raw["examples"];
  const synthesizedRaw = raw["synthesized"];
  const contributedByRaw = raw["contributedBy"];
  const base = {
    path,
    stability,
    tags: asStringArray(raw["tags"]),
    capabilities: asStringArray(raw["capabilities"]),
    input: raw["input"],
    output: raw["output"],
    exitCodes: asNumberArray(raw["exitCodes"]),
  };
  const examplesField = Array.isArray(examplesRaw)
    ? { examples: examplesRaw as NonNullable<CommandManifestEntry["examples"]> }
    : {};
  const synthesizedField =
    typeof synthesizedRaw === "boolean" ? { synthesized: synthesizedRaw } : {};
  const contributedByField =
    typeof contributedByRaw === "string" ? { contributedBy: contributedByRaw } : {};
  const entry: CommandManifestEntry = {
    ...base,
    ...examplesField,
    ...synthesizedField,
    ...contributedByField,
  };
  return entry;
}

export function loadManifestFromJson(
  json: unknown,
  opts: LoadManifestOptions = {},
): CapabilityManifest {
  if (!isRecord(json)) {
    throw new Error("Manifest payload is not an object");
  }
  const schemaVersion = json["schemaVersion"];
  if (schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schemaVersion: ${String(schemaVersion)} (expected 1)`);
  }
  const cliVersionRaw = json["cliVersion"];
  const cliVersion = typeof cliVersionRaw === "string" ? cliVersionRaw : "0.0.0";
  const commandsRaw = json["commands"];
  const rawCommands = isRecord(commandsRaw) ? commandsRaw : {};
  const includeAlpha = opts.includeAlpha === true;
  const out: Record<string, CommandManifestEntry> = {};
  for (const [path, raw] of Object.entries(rawCommands)) {
    const entry = coerceEntry(raw);
    if (entry === undefined) continue;
    if (!includeAlpha && entry.stability === "alpha") continue;
    out[path] = entry;
  }
  if (opts.pluginOverlay !== undefined) {
    for (const overlayEntry of opts.pluginOverlay) {
      if (!includeAlpha && overlayEntry.stability === "alpha") continue;
      out[overlayEntry.path] = overlayEntry;
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

export async function loadManifest(opts: LoadManifestOptions = {}): Promise<CapabilityManifest> {
  let raw: string;
  try {
    raw = await readFile(MANIFEST_URL, "utf8");
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Capability manifest not found at ${MANIFEST_URL.pathname}. Run 'tsx apps/cli/scripts/build-manifest.ts' to generate it. (${reason})`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Capability manifest at ${MANIFEST_URL.pathname} is not valid JSON: ${reason}`);
  }
  return loadManifestFromJson(parsed, opts);
}

export type { CapabilityManifest, CommandManifestEntry } from "./build.js";
