import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createFormatter } from "../src/index.js";

async function captureWith(fn: (out: PassThrough) => Promise<void>): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  await fn(out);
  out.end();
  return Buffer.concat(chunks).toString("utf8");
}

describe("createFormatter dispatch", () => {
  it("returns a JSON formatter for format=json", async () => {
    const text = await captureWith(async (out) => {
      const f = createFormatter({ format: "json", stdout: out });
      await f.write({ ok: 1 });
    });
    expect(JSON.parse(text).schemaVersion).toBe(1);
  });

  it("returns an NDJSON formatter for format=ndjson", async () => {
    const text = await captureWith(async (out) => {
      const f = createFormatter({ format: "ndjson", stdout: out });
      await f.write({ a: 1 });
    });
    expect(text.split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("quiet=true suppresses write but not error", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    stdout.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
    stderr.on("data", (c) => stderrChunks.push(Buffer.from(c)));
    const f = createFormatter({ format: "json", stdout, stderr, quiet: true });
    await f.write({ ok: 1 });
    await f.error({
      schemaVersion: 1,
      code: "SOLCLI_E_GENERIC",
      message: "x",
      exitCode: 1,
      cause: null,
    });
    stdout.end();
    stderr.end();
    expect(Buffer.concat(stdoutChunks).toString("utf8")).toContain("SOLCLI_E_GENERIC");
  });
});
