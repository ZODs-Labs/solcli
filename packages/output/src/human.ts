import type { ErrorEnvelope, OutputFormatter } from "@solcli/contracts";
import { shouldColor, supportsUnicode, terminalWidth } from "@solcli/platform";
import Table from "cli-table3";
import pc from "picocolors";

export interface HumanFormatterOptions {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  noColor?: boolean;
}

const ASCII_CHARS = {
  top: "-",
  "top-mid": "+",
  "top-left": "+",
  "top-right": "+",
  bottom: "-",
  "bottom-mid": "+",
  "bottom-left": "+",
  "bottom-right": "+",
  left: "|",
  "left-mid": "+",
  mid: "-",
  "mid-mid": "+",
  right: "|",
  "right-mid": "+",
  middle: "|",
};

export class HumanFormatter implements OutputFormatter {
  private readonly out: NodeJS.WritableStream;
  private readonly err: NodeJS.WritableStream;
  private readonly color: boolean;
  private readonly unicode: boolean;
  // terminalWidth is captured for future column-fitting; currently passed through to cli-table3 defaults.
  readonly width: number;

  constructor(opts: HumanFormatterOptions = {}) {
    this.out = opts.stdout ?? process.stdout;
    this.err = opts.stderr ?? process.stderr;
    this.color = shouldColor(opts.noColor);
    this.unicode = supportsUnicode();
    this.width = terminalWidth();
  }

  async write<T>(payload: T): Promise<void> {
    const rendered = this.render(payload);
    await this.writeLine(rendered);
  }

  async writeStream<T>(records: AsyncIterable<T>): Promise<void> {
    const rows: T[] = [];
    for await (const r of records) rows.push(r);
    await this.write(rows);
  }

  async error(env: ErrorEnvelope): Promise<void> {
    const head = this.color ? pc.red(pc.bold(env.code)) : env.code;
    const lines = [`${head}: ${env.message}`, `exit code: ${env.exitCode}`];
    if (env.details && Object.keys(env.details).length > 0) {
      lines.push("details:");
      for (const [k, v] of Object.entries(env.details)) {
        lines.push(`  ${k}: ${formatScalar(v)}`);
      }
    }
    return new Promise((resolve, reject) => {
      this.err.write(`${lines.join("\n")}\n`, (e) => (e ? reject(e) : resolve()));
    });
  }

  private render<T>(payload: T): string {
    if (payload === null || payload === undefined) return "";
    if (Array.isArray(payload)) return this.renderArray(payload);
    if (typeof payload === "object") return this.renderObject(payload as Record<string, unknown>);
    return formatScalar(payload);
  }

  private renderArray(rows: unknown[]): string {
    if (rows.length === 0) return "(empty)";
    const allObjects = rows.every(
      (r) => r !== null && typeof r === "object" && !Array.isArray(r) && !(r instanceof Date),
    );
    if (!allObjects) {
      return rows.map((r) => formatScalar(r)).join("\n");
    }
    const headers = uniqueKeys(rows as Record<string, unknown>[]);
    const tableOpts: ConstructorParameters<typeof Table>[0] = {
      head: this.color ? headers.map((h) => pc.bold(h)) : headers,
      style: { head: [], border: [] },
      wordWrap: false,
    };
    if (!this.unicode) tableOpts.chars = ASCII_CHARS;
    const table = new Table(tableOpts);
    for (const row of rows as Record<string, unknown>[]) {
      table.push(headers.map((h) => formatScalar(row[h])));
    }
    return table.toString();
  }

  private renderObject(obj: Record<string, unknown>): string {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const keyStr = this.color ? pc.bold(k) : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        lines.push(`${keyStr}:`);
        for (const line of this.renderObject(v as Record<string, unknown>).split("\n")) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`${keyStr}: ${formatScalar(v)}`);
      }
    }
    return lines.join("\n");
  }

  private writeLine(s: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.out.write(`${s}\n`, (e) => (e ? reject(e) : resolve()));
    });
  }
}

function uniqueKeys(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) seen.add(k);
  }
  return [...seen];
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
