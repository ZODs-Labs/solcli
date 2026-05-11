import { UsageError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import {
  base64Url,
  base64UrlDecode,
  formatNumber,
  fromHex,
  prettyBytes,
  safeStringify,
  toHex,
  truncate,
} from "../src/index.js";

describe("safeStringify", () => {
  it("serializes BigInt as string", () => {
    expect(safeStringify({ n: 123n })).toBe('{"n":"123"}');
  });

  it("serializes Date as ISO", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(safeStringify({ d })).toBe('{"d":"2026-01-02T03:04:05.000Z"}');
  });

  it("omits undefined keys", () => {
    expect(safeStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("throws UsageError on circular reference", () => {
    const o: { self?: unknown } = {};
    o.self = o;
    expect(() => safeStringify(o)).toThrow(UsageError);
  });
});

describe("base64Url", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 255]);
    const round = base64UrlDecode(base64Url(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });
});

describe("hex", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(toHex(bytes)).toBe("deadbeef");
    expect(Array.from(fromHex("deadbeef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
});

describe("truncate", () => {
  it("does not truncate short strings", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("truncates and appends suffix", () => {
    expect(truncate("abcdefghij", 7)).toBe("abcd...");
  });
});

describe("prettyBytes", () => {
  it("formats bytes", () => {
    expect(prettyBytes(0)).toBe("0 B");
    expect(prettyBytes(1024)).toBe("1.00 KB");
    expect(prettyBytes(1024 * 1024 * 5)).toBe("5.00 MB");
  });
});

describe("formatNumber", () => {
  it("formats with commas by default", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
  it("compact form uses K/M/B", () => {
    expect(formatNumber(1500, { compact: true })).toBe("1.50K");
    expect(formatNumber(2_500_000, { compact: true })).toBe("2.50M");
  });
});
