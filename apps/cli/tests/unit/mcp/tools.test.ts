import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, vi } from "vitest";
import type { Context } from "../../../src/context.js";

const writes: unknown[] = [];

vi.mock("../../../src/operations/mcp-tools.js", () => ({
  loadMcpToolList: vi.fn(async (_ctx: Context, opts: { includeAlpha: boolean }) => [
    {
      name: "solcli.doctor",
      description: "test",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      _includeAlpha: opts.includeAlpha,
    },
  ]),
}));

const fakeStorage = new AsyncLocalStorage<Context>();

vi.mock("../../../src/context.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    withContext: <T>(fn: (ctx: Context) => Promise<T> | T): Promise<T> => {
      const ctx = fakeStorage.getStore();
      if (ctx === undefined) {
        return Promise.reject(new Error("test: no context set"));
      }
      return Promise.resolve(fn(ctx));
    },
  };
});

function makeCtx(): Context {
  return {
    output: {
      write: vi.fn(async (payload: unknown) => {
        writes.push(payload);
      }),
      writeStream: vi.fn(async (_records: AsyncIterable<unknown>) => {}),
      error: vi.fn(async (_env: unknown) => {}),
    },
    errors: {
      usage: ((message: string) => new Error(message)) as unknown as Context["errors"]["usage"],
      nonInteractive: ((message: string) =>
        new Error(message)) as unknown as Context["errors"]["nonInteractive"],
      secret: ((message: string) => new Error(message)) as unknown as Context["errors"]["secret"],
    },
    abortController: new AbortController(),
  } as unknown as Context;
}

interface CittyLike {
  meta: { name: string };
  args: Record<string, unknown>;
  run: (input: { args: Record<string, unknown>; rawArgs: readonly string[] }) => Promise<void>;
}

describe("mcp tools command", () => {
  it("writes an mcp.tools envelope through ctx.output", async () => {
    writes.length = 0;
    const ctx = makeCtx();
    const mod = (await import("../../../src/commands/mcp/tools.command.js")) as {
      default: CittyLike;
    };
    const cmd = mod.default;
    expect(cmd.meta.name).toBe("tools");
    expect(cmd.args).toHaveProperty("include-alpha");
    await fakeStorage.run(ctx, async () => {
      await cmd.run({ args: { "include-alpha": false }, rawArgs: [] });
    });
    expect(writes).toHaveLength(1);
    const payload = writes[0] as {
      kind: string;
      data: ReadonlyArray<{ name: string }>;
      meta: { cliVersion: string };
    };
    expect(payload.kind).toBe("mcp.tools");
    expect(payload.data[0]?.name).toBe("solcli.doctor");
    expect(typeof payload.meta.cliVersion).toBe("string");
  });

  it("forwards include-alpha to the operation", async () => {
    writes.length = 0;
    const ctx = makeCtx();
    const mod = (await import("../../../src/commands/mcp/tools.command.js")) as {
      default: CittyLike;
    };
    const opsMod = (await import("../../../src/operations/mcp-tools.js")) as {
      loadMcpToolList: ReturnType<typeof vi.fn>;
    };
    await fakeStorage.run(ctx, async () => {
      await mod.default.run({ args: { "include-alpha": true }, rawArgs: [] });
    });
    expect(opsMod.loadMcpToolList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeAlpha: true }),
    );
  });
});
