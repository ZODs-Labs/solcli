import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { HumanFormatter } from "../src/index.js";

async function capture(fn: (out: PassThrough) => Promise<void>): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(Buffer.from(c)));
  await fn(out);
  out.end();
  return Buffer.concat(chunks).toString("utf8");
}

describe("HumanFormatter", () => {
  it("renders an object as key: value lines", async () => {
    const text = await capture(async (out) => {
      const f = new HumanFormatter({ stdout: out, noColor: true });
      await f.write({ name: "solcli", version: "0.0.1" });
    });
    expect(text).toContain("name: solcli");
    expect(text).toContain("version: 0.0.1");
  });

  it("renders an array of objects as a table", async () => {
    const text = await capture(async (out) => {
      const f = new HumanFormatter({ stdout: out, noColor: true });
      await f.write([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]);
    });
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(text).toContain("1");
    expect(text).toContain("3");
  });

  it("renders bigint and Date safely", async () => {
    const text = await capture(async (out) => {
      const f = new HumanFormatter({ stdout: out, noColor: true });
      await f.write({ n: 12345n, when: new Date("2026-01-01T00:00:00Z") });
    });
    expect(text).toContain("12345");
    expect(text).toContain("2026-01-01T00:00:00.000Z");
  });
});
