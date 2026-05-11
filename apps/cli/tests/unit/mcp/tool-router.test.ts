import { describe, expect, it, vi } from "vitest";
import type { Context } from "../../../src/context.js";
import type { CapabilityManifest } from "../../../src/manifest/build.js";
import { buildToolList, dispatchToolCall } from "../../../src/mcp/tool-router.js";
import type { ImporterMap } from "../../../src/mcp/types.js";

function makeCtx(): Context {
  const abortController = new AbortController();
  const ctx = {
    output: {
      write: vi.fn(async (_payload: unknown) => {
        // replaced by withCapturedOutput at dispatch time
      }),
      writeStream: vi.fn(async (_records: AsyncIterable<unknown>) => {}),
      error: vi.fn(async (_env: unknown) => {}),
    },
    errors: {
      usage: (message: string, opts?: { details?: Record<string, unknown> }) => {
        const err = new Error(message) as Error & {
          code: string;
          exitCode: number;
          details?: Record<string, unknown>;
          toEnvelope: () => unknown;
        };
        err.code = "SOLCLI_E_USAGE";
        err.exitCode = 2;
        if (opts?.details !== undefined) err.details = opts.details;
        err.toEnvelope = () => ({
          schemaVersion: 1,
          code: err.code,
          message: err.message,
          exitCode: err.exitCode,
          details: err.details,
          cause: null,
        });
        return err as unknown as ReturnType<Context["errors"]["usage"]>;
      },
      nonInteractive: ((message: string) =>
        new Error(message)) as unknown as Context["errors"]["nonInteractive"],
      secret: ((message: string) => new Error(message)) as unknown as Context["errors"]["secret"],
    },
    abortController,
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as Context;
  return ctx;
}

function manifestWith(path: string): CapabilityManifest {
  return {
    schemaVersion: 1,
    cliVersion: "0.0.1",
    commands: {
      [path]: {
        path,
        stability: "beta",
        tags: ["test", "demo"],
        capabilities: [],
        input: { type: "object", properties: {} },
        output: { type: "object" },
        exitCodes: [0, 2],
      },
    },
  };
}

describe("buildToolList", () => {
  it("prefixes tool names with solcli. and uses tags when no description exists", () => {
    const manifest = manifestWith("doctor");
    const list = buildToolList(manifest);
    expect(list).toHaveLength(1);
    const first = list[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.name).toBe("solcli.doctor");
    expect(first.description).toBe("test demo");
    expect(first.inputSchema).toEqual({ type: "object", properties: {} });
  });

  it("falls back to the path when tags are empty", () => {
    const manifest: CapabilityManifest = {
      schemaVersion: 1,
      cliVersion: "0.0.1",
      commands: {
        secrets: {
          path: "secrets",
          stability: "beta",
          tags: [],
          capabilities: [],
          input: {},
          output: {},
          exitCodes: [0, 2],
        },
      },
    };
    const list = buildToolList(manifest);
    expect(list[0]?.description).toBe("secrets");
  });
});

describe("dispatchToolCall", () => {
  it("captures stdout from a dispatched command and returns it as text content", async () => {
    const ctx = makeCtx();
    const manifest = manifestWith("echo");
    const importers: ImporterMap = {
      echo: async () => ({
        default: {
          run: async ({ args }: { args: Record<string, unknown> }) => {
            // The ctx swap means this read picks up the captured formatter.
            await ctx.output.write({ echoed: args });
          },
        },
      }),
    };
    const result = await dispatchToolCall(
      ctx,
      "solcli.echo",
      { hello: "world" },
      manifest,
      importers,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const first = result.content[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.type).toBe("text");
    const parsed = JSON.parse(first.text) as { schemaVersion: number; data: unknown };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data).toEqual({ echoed: { hello: "world" } });
  });

  it("returns an error envelope when the tool name has no solcli. prefix", async () => {
    const ctx = makeCtx();
    const manifest = manifestWith("echo");
    const result = await dispatchToolCall(ctx, "foo.bar", {}, manifest, {});
    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const parsed = JSON.parse(first.text) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("SOLCLI_E_USAGE");
    expect(parsed.error.message).toMatch(/unknown tool/);
  });

  it("returns an error envelope when the command path is not in the manifest", async () => {
    const ctx = makeCtx();
    const manifest = manifestWith("echo");
    const result = await dispatchToolCall(ctx, "solcli.missing", {}, manifest, {});
    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const parsed = JSON.parse(first.text) as { error: { code: string; message: string } };
    expect(parsed.error.message).toMatch(/unknown command path/);
  });

  it("returns an error envelope when the importer is missing", async () => {
    const ctx = makeCtx();
    const manifest = manifestWith("echo");
    const result = await dispatchToolCall(ctx, "solcli.echo", {}, manifest, {});
    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const parsed = JSON.parse(first.text) as { error: { message: string } };
    expect(parsed.error.message).toMatch(/no importer/);
  });

  it("wraps a thrown SolcliError into an error envelope", async () => {
    const ctx = makeCtx();
    const manifest = manifestWith("boom");
    const importers: ImporterMap = {
      boom: async () => ({
        default: {
          run: async () => {
            throw ctx.errors.usage("nope");
          },
        },
      }),
    };
    const result = await dispatchToolCall(ctx, "solcli.boom", {}, manifest, importers);
    expect(result.isError).toBe(true);
    const first = result.content[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const parsed = JSON.parse(first.text) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("SOLCLI_E_USAGE");
    expect(parsed.error.message).toBe("nope");
  });
});
