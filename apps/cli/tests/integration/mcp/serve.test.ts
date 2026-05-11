import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, vi } from "vitest";
import type { Context } from "../../../src/context.js";

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

interface UsageErrLike extends Error {
  code: string;
  exitCode: number;
  details?: Record<string, unknown>;
}

function makeCtx(): Context {
  return {
    output: {
      write: vi.fn(async (_payload: unknown) => {}),
      writeStream: vi.fn(async (_records: AsyncIterable<unknown>) => {}),
      error: vi.fn(async (_env: unknown) => {}),
    },
    errors: {
      usage: (message: string, opts?: { details?: Record<string, unknown> }) => {
        const err = new Error(message) as UsageErrLike;
        err.code = "SOLCLI_E_USAGE";
        err.exitCode = 2;
        if (opts?.details !== undefined) err.details = opts.details;
        return err as unknown as ReturnType<Context["errors"]["usage"]>;
      },
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

describe("mcp serve command", () => {
  it("rejects --transport http-sse with SOLCLI_E_MCP_TRANSPORT_UNSUPPORTED", async () => {
    const ctx = makeCtx();
    const mod = (await import("../../../src/commands/mcp/serve.command.js")) as {
      default: CittyLike;
    };
    let caught: unknown;
    await fakeStorage.run(ctx, async () => {
      try {
        await mod.default.run({ args: { transport: "http-sse" }, rawArgs: [] });
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeDefined();
    const err = caught as UsageErrLike;
    expect(err.code).toBe("SOLCLI_E_USAGE");
    expect(err.details).toBeDefined();
    expect(err.details?.errorCode).toBe("SOLCLI_E_MCP_TRANSPORT_UNSUPPORTED");
    expect(err.message).toMatch(/HTTP\+SSE/);
  });

  it("rejects an unknown transport with a usage error", async () => {
    const ctx = makeCtx();
    const mod = (await import("../../../src/commands/mcp/serve.command.js")) as {
      default: CittyLike;
    };
    let caught: unknown;
    await fakeStorage.run(ctx, async () => {
      try {
        await mod.default.run({ args: { transport: "ws" }, rawArgs: [] });
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeDefined();
    const err = caught as UsageErrLike;
    expect(err.code).toBe("SOLCLI_E_USAGE");
    expect(err.message).toMatch(/unknown MCP transport/);
  });

  it("registers serve and tools subcommands on the mcp group", async () => {
    const mod = (await import("../../../src/commands/mcp/index.js")) as {
      default: { subCommands: Record<string, unknown> };
    };
    expect(mod.default.subCommands).toHaveProperty("serve");
    expect(mod.default.subCommands).toHaveProperty("tools");
  });
});
