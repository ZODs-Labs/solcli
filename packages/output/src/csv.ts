import type { ErrorEnvelope, OutputFormatter } from "@solcli/contracts";
import { UsageError } from "@solcli/errors";
import { stringify } from "csv-stringify";

export interface CsvFormatterOptions {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export class CsvFormatter implements OutputFormatter {
  private readonly out: NodeJS.WritableStream;
  private readonly err: NodeJS.WritableStream;

  constructor(opts: CsvFormatterOptions = {}) {
    this.out = opts.stdout ?? process.stdout;
    this.err = opts.stderr ?? process.stderr;
  }

  async write<T>(payload: T): Promise<void> {
    if (Array.isArray(payload)) {
      await this.writeArray(payload);
      return;
    }
    if (typeof payload === "object" && payload !== null) {
      await this.writeArray([payload]);
      return;
    }
    throw new UsageError("CSV output requires an object or an array of objects");
  }

  async writeStream<T>(records: AsyncIterable<T>): Promise<void> {
    const collected: T[] = [];
    for await (const r of records) collected.push(r);
    await this.writeArray(collected);
  }

  async error(env: ErrorEnvelope): Promise<void> {
    return new Promise((resolve, reject) => {
      this.err.write(`${JSON.stringify({ schemaVersion: 1, error: env })}\n`, (e) =>
        e ? reject(e) : resolve(),
      );
    });
  }

  private writeArray<T>(rows: T[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (rows.length === 0) {
        this.out.write("", () => resolve());
        return;
      }
      const flat = rows.map((r) => flattenForCsv(r));
      const headers = Object.keys(flat[0] as Record<string, unknown>);
      stringify(
        flat,
        { header: true, columns: headers, cast: { object: csvObjectCast } },
        (err, str) => {
          if (err) {
            reject(err);
            return;
          }
          this.out.write(str, (e) => (e ? reject(e) : resolve()));
        },
      );
    });
  }
}

function csvObjectCast(value: object): string {
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function flattenForCsv(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== "object") {
    return { value: scalarToCsv(value) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = scalarToCsv(v);
  }
  return out;
}

function scalarToCsv(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}
