import { describe, expect, it, vi } from "vitest";
import type { Context } from "../../../src/context.js";
import type { CapabilityManifest } from "../../../src/manifest/build.js";
import { dispatchToolCall } from "../../../src/mcp/tool-router.js";
import type { ImporterMap } from "../../../src/mcp/types.js";

function makeCtx(): Context {
  const abortController = new AbortController();
  return {
    output: {
      write: vi.fn(async (_payload: unknown) => {}),
      writeStream: vi.fn(async (_records: AsyncIterable<unknown>) => {}),
      error: vi.fn(async (_env: unknown) => {}),
    },
    errors: {
      usage: (message: string) => {
        const err = new Error(message) as Error & {
          code: string;
          exitCode: number;
          toEnvelope: () => unknown;
        };
        err.code = "SOLCLI_E_USAGE";
        err.exitCode = 2;
        err.toEnvelope = () => ({
          schemaVersion: 1,
          code: err.code,
          message: err.message,
          exitCode: err.exitCode,
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
}

describe("dispatch output isolation", () => {
  it("never writes to process.stdout during a tool dispatch", async () => {
    const ctx = makeCtx();
    const manifest: CapabilityManifest = {
      schemaVersion: 1,
      cliVersion: "0.0.1",
      commands: {
        echo: {
          path: "echo",
          stability: "beta",
          tags: [],
          capabilities: [],
          input: {},
          output: {},
          exitCodes: [0, 2],
        },
      },
    };
    const importers: ImporterMap = {
      echo: async () => ({
        default: {
          run: async () => {
            // Write something substantial that would be obvious if leaked.
            await ctx.output.write({ noisy: "x".repeat(2048) });
          },
        },
      }),
    };
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    try {
      const result = await dispatchToolCall(ctx, "solcli.echo", {}, manifest, importers);
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("noisy");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
