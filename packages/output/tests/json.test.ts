import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonFormatter } from "../src/index.js";

async function capture(fn: (out: PassThrough) => Promise<void>): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  await fn(out);
  out.end();
  return Buffer.concat(chunks).toString("utf8");
}

describe("JsonFormatter", () => {
  it("emits a single JSON envelope with schemaVersion 1", async () => {
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      await f.write({ hello: "world" });
    });
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data).toEqual({ hello: "world" });
  });

  it("serializes BigInt as string", async () => {
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      await f.write({ amount: 12345678901234567890n });
    });
    const parsed = JSON.parse(text);
    expect(parsed.data.amount).toBe("12345678901234567890");
  });

  it("serializes Date as ISO string", async () => {
    const d = new Date("2026-05-11T12:00:00Z");
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      await f.write({ when: d });
    });
    const parsed = JSON.parse(text);
    expect(parsed.data.when).toBe("2026-05-11T12:00:00.000Z");
  });

  it("error emits envelope with schemaVersion + error", async () => {
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      await f.error({
        schemaVersion: 1,
        code: "SOLCLI_E_USAGE",
        message: "bad",
        exitCode: 2,
        cause: null,
      });
    });
    const parsed = JSON.parse(text);
    expect(parsed.error.code).toBe("SOLCLI_E_USAGE");
    expect(parsed.error.exitCode).toBe(2);
  });

  it("writeStream collects records into a single array", async () => {
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      async function* gen() {
        yield { i: 1 };
        yield { i: 2 };
      }
      await f.writeStream(gen());
    });
    const parsed = JSON.parse(text);
    expect(parsed.data).toEqual([{ i: 1 }, { i: 2 }]);
  });

  it("output is jq-parseable (single document, single trailing newline)", async () => {
    const text = await capture(async (out) => {
      const f = new JsonFormatter({ stdout: out });
      await f.write({ ok: true });
    });
    const trimmedNewlines = text.split("\n").filter((l) => l.length > 0);
    expect(trimmedNewlines).toHaveLength(1);
  });
});
