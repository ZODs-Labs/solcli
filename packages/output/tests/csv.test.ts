import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { CsvFormatter } from "../src/index.js";

async function capture(fn: (out: PassThrough) => Promise<void>): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  await fn(out);
  out.end();
  return Buffer.concat(chunks).toString("utf8");
}

describe("CsvFormatter", () => {
  it("emits header derived from first row", async () => {
    const text = await capture(async (out) => {
      const f = new CsvFormatter({ stdout: out });
      await f.write([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]);
    });
    const lines = text.split("\n").filter(Boolean);
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("1,2");
    expect(lines[2]).toBe("3,4");
  });

  it("escapes fields containing commas", async () => {
    const text = await capture(async (out) => {
      const f = new CsvFormatter({ stdout: out });
      await f.write([{ a: "hello, world", b: "x" }]);
    });
    expect(text).toContain('"hello, world"');
  });

  it("renders BigInt as string", async () => {
    const text = await capture(async (out) => {
      const f = new CsvFormatter({ stdout: out });
      await f.write([{ amount: 12345n }]);
    });
    expect(text).toContain("12345");
  });
});
