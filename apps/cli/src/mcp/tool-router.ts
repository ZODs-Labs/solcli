import type { Context } from "../context.js";
import { setCurrentContext } from "../context.js";
import { withCapturedOutput } from "./captured-sink.js";
import type {
  CapabilityManifest,
  CommandImporter,
  CommandManifestEntry,
  ImporterMap,
  McpTool,
  McpToolResult,
} from "./types.js";

const TOOL_PREFIX = "solcli.";

interface CittyLikeRunInput {
  readonly args: Record<string, unknown>;
  readonly rawArgs: readonly string[];
}

interface CittyLikeCommandDef {
  readonly run?: (input: CittyLikeRunInput) => Promise<void> | void;
}

interface ErrorEnvelopeShape {
  readonly schemaVersion: 1;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly exitCode: number;
    readonly details?: Record<string, unknown>;
    readonly cause: ErrorEnvelopeShape["error"] | null;
  };
}

function describe(entry: CommandManifestEntry): string {
  if (entry.tags.length > 0) return entry.tags.join(" ");
  return entry.path;
}

export function buildToolList(manifest: CapabilityManifest): readonly McpTool[] {
  const entries = Object.values(manifest.commands);
  return entries.map(
    (entry): McpTool => ({
      name: `${TOOL_PREFIX}${entry.path}`,
      description: describe(entry),
      inputSchema: entry.input,
      outputSchema: entry.output,
    }),
  );
}

function isCittyLikeCommand(value: unknown): value is CittyLikeCommandDef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { run?: unknown };
  return candidate.run === undefined || typeof candidate.run === "function";
}

export async function callCittyRun(
  cmdDef: unknown,
  args: Record<string, unknown>,
  ctx: Context,
): Promise<void> {
  if (!isCittyLikeCommand(cmdDef) || typeof cmdDef.run !== "function") {
    throw ctx.errors.usage("command has no runnable entry");
  }
  await cmdDef.run({ args, rawArgs: [] });
}

function isSolcliErrorShape(value: unknown): value is {
  code: string;
  message: string;
  exitCode?: number;
  details?: Record<string, unknown>;
  toEnvelope?: () => unknown;
} {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { code?: unknown; message?: unknown };
  return typeof v.code === "string" && typeof v.message === "string";
}

function toErrorEnvelope(err: unknown): ErrorEnvelopeShape {
  if (isSolcliErrorShape(err) && typeof err.toEnvelope === "function") {
    const env = err.toEnvelope();
    return { schemaVersion: 1, error: env as ErrorEnvelopeShape["error"] };
  }
  if (isSolcliErrorShape(err)) {
    const inner: ErrorEnvelopeShape["error"] = {
      code: err.code,
      message: err.message,
      exitCode: typeof err.exitCode === "number" ? err.exitCode : 1,
      cause: null,
    };
    if (err.details !== undefined) {
      return {
        schemaVersion: 1,
        error: { ...inner, details: err.details },
      };
    }
    return { schemaVersion: 1, error: inner };
  }
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return {
    schemaVersion: 1,
    error: {
      code: "SOLCLI_E_INTERNAL",
      message,
      exitCode: 70,
      cause: null,
    },
  };
}

function importerFor(manifestPath: string, importers: ImporterMap): CommandImporter | undefined {
  return importers[manifestPath];
}

export async function dispatchToolCall(
  ctx: Context,
  toolName: string,
  args: Record<string, unknown>,
  manifest: CapabilityManifest,
  importers: ImporterMap,
): Promise<McpToolResult> {
  if (!toolName.startsWith(TOOL_PREFIX)) {
    const envelope = toErrorEnvelope(
      ctx.errors.usage(`unknown tool: ${toolName}`, { details: { toolName } }),
    );
    return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
  }
  const path = toolName.slice(TOOL_PREFIX.length);
  const entry = manifest.commands[path];
  if (entry === undefined) {
    const envelope = toErrorEnvelope(
      ctx.errors.usage(`unknown command path: ${path}`, { details: { path } }),
    );
    return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
  }
  const importer = importerFor(path, importers);
  if (importer === undefined) {
    const envelope = toErrorEnvelope(
      ctx.errors.usage(`no importer registered for ${path}`, { details: { path } }),
    );
    return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
  }
  setCurrentContext(ctx);
  ctx.abortController.signal.throwIfAborted?.();
  try {
    const text = await withCapturedOutput(ctx, async (readCaptured) => {
      const mod = await importer();
      await callCittyRun(mod.default, args, ctx);
      return readCaptured();
    });
    return { content: [{ type: "text", text: text.trimEnd() }] };
  } catch (err) {
    const envelope = toErrorEnvelope(err);
    return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
  }
}

interface ServerLike {
  setRequestHandler: (method: string, handler: (req: unknown) => Promise<unknown>) => void;
  notification?: (n: { method: string; params: unknown }) => Promise<void>;
}

interface ToolsListRequest {
  readonly method: "tools/list";
  readonly params?: unknown;
}

interface ToolsCallRequest {
  readonly method: "tools/call";
  readonly params: { readonly name: string; readonly arguments?: Record<string, unknown> };
}

function extractToolCallParams(
  req: unknown,
): { name: string; args: Record<string, unknown> } | undefined {
  if (typeof req !== "object" || req === null) return undefined;
  const candidate = req as { params?: unknown };
  if (typeof candidate.params !== "object" || candidate.params === null) return undefined;
  const params = candidate.params as { name?: unknown; arguments?: unknown };
  if (typeof params.name !== "string") return undefined;
  const args =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};
  return { name: params.name, args };
}

export function registerTools(
  server: ServerLike,
  manifest: CapabilityManifest,
  ctx: Context,
  importers: ImporterMap,
): void {
  const list = buildToolList(manifest);
  server.setRequestHandler("tools/list", async (_req: unknown): Promise<unknown> => {
    void (_req as ToolsListRequest | undefined);
    return { tools: list };
  });
  server.setRequestHandler("tools/call", async (req: unknown): Promise<unknown> => {
    const parsed = extractToolCallParams(req);
    if (parsed === undefined) {
      const envelope = toErrorEnvelope(
        ctx.errors.usage("tools/call requires params.name", {
          details: { received: typeof req },
        }),
      );
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(envelope) }],
      } satisfies McpToolResult;
    }
    return dispatchToolCall(ctx, parsed.name, parsed.args, manifest, importers);
  });
  void (null as unknown as ToolsCallRequest);
}
