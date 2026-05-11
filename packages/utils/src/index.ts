import { Buffer } from "node:buffer";
import { UsageError } from "@solcli/errors";

export * from "./domain/index.js";

export function safeStringify(value: unknown, indent?: number): string {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, v: unknown): unknown => {
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) {
        throw new UsageError("Cannot serialize: circular reference in payload");
      }
      seen.add(v);
    }
    return v;
  };
  return JSON.stringify(value, replacer, indent);
}

export function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function fromHex(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "hex"));
}

export function truncate(s: string, n: number, suffix = "..."): string {
  if (s.length <= n) return s;
  if (n <= suffix.length) return s.slice(0, n);
  return `${s.slice(0, n - suffix.length)}${suffix}`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function prettyBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 0) return `-${prettyBytes(-bytes)}`;
  if (bytes < 1024) return `${bytes} B`;
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(2)} ${UNITS[i]}`;
}

export interface FormatNumberOptions {
  compact?: boolean;
  decimals?: number;
}

export function formatNumber(n: number, opts: FormatNumberOptions = {}): string {
  if (!Number.isFinite(n)) return String(n);
  if (opts.compact) {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    const suffixes = [
      { v: 1e12, s: "T" },
      { v: 1e9, s: "B" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const { v, s } of suffixes) {
      if (abs >= v) return `${sign}${(abs / v).toFixed(opts.decimals ?? 2)}${s}`;
    }
  }
  const fmtOpts: Intl.NumberFormatOptions = {};
  if (opts.decimals !== undefined) {
    fmtOpts.minimumFractionDigits = opts.decimals;
    fmtOpts.maximumFractionDigits = opts.decimals;
  }
  return n.toLocaleString("en-US", fmtOpts);
}
