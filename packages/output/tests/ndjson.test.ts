import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { NdjsonFormatter } from "../src/index.js";

async function capture(fn: (out: PassThrough) => Promise<void>): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  await fn(out);
  out.end();
  return Buffer.concat(chunks).toString("utf8");
}

describe("NdjsonFormatter", () => {
  it("write emits one envelope line for scalar/object payloads", async () => {
    const text = await capture(async (out) => {
      const f = new NdjsonFormatter({ stdout: out });
      await f.write({ a: 1 });
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({ schemaVersion: 1, data: { a: 1 } });
  });

  it("write fans out top-level arrays as one envelope per element", async () => {
    const text = await capture(async (out) => {
      const f = new NdjsonFormatter({ stdout: out });
      await f.write([{ i: 0 }, { i: 1 }, { i: 2 }]);
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] as string)).toEqual({ schemaVersion: 1, data: { i: 0 } });
    expect(JSON.parse(lines[2] as string)).toEqual({ schemaVersion: 1, data: { i: 2 } });
  });

  it("write fans out {records: [...]} payloads as one envelope per record", async () => {
    const text = await capture(async (out) => {
      const f = new NdjsonFormatter({ stdout: out });
      await f.write({ subject: "demo", records: [{ i: 0 }, { i: 1 }] });
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toEqual({ schemaVersion: 1, data: { i: 0 } });
    expect(JSON.parse(lines[1] as string)).toEqual({ schemaVersion: 1, data: { i: 1 } });
  });

  it("writeStream emits one envelope per record", async () => {
    const text = await capture(async (out) => {
      const f = new NdjsonFormatter({ stdout: out });
      async function* gen() {
        yield { i: 1 };
        yield { i: 2 };
        yield { i: 3 };
      }
      await f.writeStream(gen());
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] as string)).toEqual({ schemaVersion: 1, data: { i: 1 } });
    expect(JSON.parse(lines[2] as string)).toEqual({ schemaVersion: 1, data: { i: 3 } });
  });

  it("uses LF only (no CRLF) regardless of platform", async () => {
    const text = await capture(async (out) => {
      const f = new NdjsonFormatter({ stdout: out });
      await f.write({ a: 1 });
    });
    expect(text.includes("\r")).toBe(false);
  });
});
