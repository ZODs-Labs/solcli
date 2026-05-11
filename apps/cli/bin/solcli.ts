#!/usr/bin/env node
import process from "node:process";
import type { ErrorEnvelope } from "@solcli/contracts";
import {
  installGlobalErrorHandlers,
  type SolcliError,
  toSolcliError,
  UsageError,
} from "@solcli/errors";
import { installSignalHandlers } from "@solcli/platform";
import { type CommandDef, runCommand, showUsage } from "citty";
import { getCurrentContext } from "../src/context.js";
import { rootCommand } from "../src/registry.js";

installSignalHandlers();
installGlobalErrorHandlers();

// Narrow citty's invariant inferred type to the open CommandDef accepted by runCommand/showUsage.
const root: CommandDef = rootCommand as unknown as CommandDef;

const rawArgs = process.argv.slice(2);

try {
  await main(rawArgs);
} catch (err) {
  await handleError(err);
}

await flushContext();
process.exit(process.exitCode ?? 0);

async function main(args: string[]): Promise<void> {
  if (isVersionRequest(args)) {
    const meta = await resolveMeta(root);
    if (!meta?.version) {
      throw new UsageError("No version specified");
    }
    process.stdout.write(`${meta.version}\n`);
    return;
  }

  if (isHelpRequest(args)) {
    await renderHelpFor(args);
    return;
  }

  await runCommand(root, { rawArgs: args });
}

function isVersionRequest(args: string[]): boolean {
  return args.length === 1 && (args[0] === "--version" || args[0] === "-v");
}

function isHelpRequest(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

async function renderHelpFor(args: string[]): Promise<void> {
  let current: CommandDef = root;
  const parents: CommandDef[] = [];

  for (const arg of args) {
    if (arg.startsWith("-")) break;
    const subs = await resolveSubCommands(current);
    if (!subs) break;
    const loader = subs[arg];
    if (!loader) break;
    const sub = await loader();
    parents.push(current);
    current = sub;
  }

  await showUsage(current, ...parents);
}

async function resolveMeta(cmd: CommandDef): Promise<{ version?: string } | undefined> {
  const raw = typeof cmd.meta === "function" ? await cmd.meta() : await cmd.meta;
  return raw as { version?: string } | undefined;
}

async function resolveSubCommands(
  cmd: CommandDef,
): Promise<Record<string, () => Promise<CommandDef>> | undefined> {
  const raw =
    typeof cmd.subCommands === "function" ? await cmd.subCommands() : await cmd.subCommands;
  if (!raw) return undefined;
  return raw as Record<string, () => Promise<CommandDef>>;
}

async function handleError(err: unknown): Promise<void> {
  const solErr = normalizeError(err);
  const envelope = solErr.toEnvelope();
  await emitErrorEnvelope(envelope, solErr);
  process.exitCode = solErr.exitCode;
}

function normalizeError(err: unknown): SolcliError {
  // citty CLIError (EARG, E_UNKNOWN_COMMAND, E_NO_COMMAND) -> UsageError.
  if (err instanceof Error && err.name === "CLIError") {
    const code = (err as { code?: unknown }).code;
    const details: Record<string, unknown> = {};
    if (typeof code === "string") details["cittyCode"] = code;
    return new UsageError(err.message, { details });
  }
  return toSolcliError(err);
}

async function emitErrorEnvelope(envelope: ErrorEnvelope, solErr: SolcliError): Promise<void> {
  const ctx = getCurrentContext();
  if (ctx?.output) {
    try {
      await ctx.output.error(envelope);
      return;
    } catch {
      // Formatter failed; fall through to fail-safe stderr write.
    }
  }
  writeFailsafe(envelope, solErr);
}

function writeFailsafe(envelope: ErrorEnvelope, solErr: SolcliError): void {
  const wantsJson = wantsJsonFromArgv() || !process.stderr.isTTY;
  const payload = wantsJson
    ? `${JSON.stringify({ schemaVersion: 1, error: envelope })}\n`
    : `${solErr.code}: ${solErr.message}\nexit code: ${solErr.exitCode}\n`;
  try {
    process.stderr.write(payload);
  } catch {
    // ignore secondary failure
  }
}

function wantsJsonFromArgv(): boolean {
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === "--output" || arg === "-o") {
      const next = rawArgs[i + 1];
      if (next === "json" || next === "ndjson") return true;
    } else if (
      arg === "--output=json" ||
      arg === "--output=ndjson" ||
      arg === "-o=json" ||
      arg === "-o=ndjson" ||
      arg === "--json"
    ) {
      return true;
    }
  }
  return false;
}

async function flushContext(): Promise<void> {
  const ctx = getCurrentContext();
  if (!ctx) return;
  try {
    await ctx.teardown();
  } catch {
    // best-effort flush
  }
}
