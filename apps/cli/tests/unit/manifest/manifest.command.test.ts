import { describe, expect, it, vi } from "vitest";
import manifestCommand, {
  executeManifest,
} from "../../../src/commands/manifest/manifest.command.js";
import type { Context } from "../../../src/context.js";
import type { CapabilityManifest, CommandManifestEntry } from "../../../src/manifest/build.js";

function entry(path: string): CommandManifestEntry {
  return {
    path,
    stability: "beta",
    tags: [],
    capabilities: [],
    input: { type: "object", properties: {} },
    output: { type: "object", properties: { schemaVersion: { const: 1 }, data: {} } },
    exitCodes: [0, 2],
  };
}

function fixture(): CapabilityManifest {
  return {
    schemaVersion: 1,
    cliVersion: "0.0.1",
    commands: {
      doctor: entry("doctor"),
      "config.get": entry("config.get"),
    },
  };
}

interface CtxBundle {
  ctx: Context;
  writes: unknown[];
  warnSpy: ReturnType<typeof vi.fn>;
}

function makeCtx(): CtxBundle {
  const writes: unknown[] = [];
  const warnSpy = vi.fn();
  const ctx = {
    output: {
      write: vi.fn(async (payload: unknown) => {
        writes.push(payload);
      }),
    },
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
    },
    errors: {
      usage: (message: string, opts?: { details?: Record<string, unknown> }) => {
        const err = new Error(message) as Error & { details?: Record<string, unknown> };
        if (opts?.details !== undefined) err.details = opts.details;
        return err;
      },
    },
  } as unknown as Context;
  return { ctx, writes, warnSpy };
}

describe("manifest command", () => {
  it("exposes a citty command with the expected meta and args", () => {
    const cmd = manifestCommand as {
      meta: { name: string };
      args: Record<string, unknown>;
      run: unknown;
    };
    expect(cmd.meta.name).toBe("manifest");
    expect(cmd.args).toHaveProperty("format");
    expect(cmd.args).toHaveProperty("include-alpha");
    expect(typeof cmd.run).toBe("function");
  });

  it("emits a manifest.tree envelope in json mode", async () => {
    const { ctx, writes } = makeCtx();
    const manifest = fixture();
    await executeManifest(ctx, "json", false, async () => manifest);
    expect(writes).toHaveLength(1);
    const payload = writes[0] as {
      kind: string;
      data: CapabilityManifest;
      meta: { cliVersion: string };
    };
    expect(payload.kind).toBe("manifest.tree");
    expect(payload.data).toEqual(manifest);
    expect(payload.meta.cliVersion).toBe("0.0.1");
    expect(typeof payload.meta.generatedAt).toBe("string");
  });

  it("emits one manifest.entry per command in ndjson mode", async () => {
    const { ctx, writes } = makeCtx();
    const manifest = fixture();
    await executeManifest(ctx, "ndjson", false, async () => manifest);
    expect(writes).toHaveLength(2);
    const kinds = writes.map((w) => (w as { kind: string }).kind);
    expect(kinds).toEqual(["manifest.entry", "manifest.entry"]);
  });

  it("falls back to JSON when yaml is requested and logs a warning", async () => {
    const { ctx, writes, warnSpy } = makeCtx();
    const manifest = fixture();
    await executeManifest(ctx, "yaml", false, async () => manifest);
    expect(writes).toHaveLength(1);
    expect((writes[0] as { kind: string }).kind).toBe("manifest.tree");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("forwards includeAlpha to the loader", async () => {
    const { ctx } = makeCtx();
    const manifest = fixture();
    const loader = vi.fn(async () => manifest);
    await executeManifest(ctx, "json", true, loader);
    expect(loader).toHaveBeenCalledWith({ includeAlpha: true });
  });

  it("throws ctx.errors.usage for an unknown format", async () => {
    const { ctx } = makeCtx();
    const manifest = fixture();
    await expect(executeManifest(ctx, "xml", false, async () => manifest)).rejects.toThrow(
      /unknown --format xml/,
    );
  });
});
