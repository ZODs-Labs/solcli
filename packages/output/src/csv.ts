import type { ErrorEnvelope, OutputFormatter } from "@solcli/contracts";
import { UsageError } from "@solcli/errors";
import { type Options, type Stringifier, stringify } from "csv-stringify";
import { writeChunk } from "./write-stream.js";

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
    const iterator = records[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done === true) {
      await writeChunk(this.out, "");
      return;
    }
    const firstRow = flattenForCsv(first.value);
    const headers = Object.keys(firstRow);
    const stringifier = stringify(csvOptions(headers));
    const completion = this.pipeStringifier(stringifier);
    await writeRecord(stringifier, firstRow);
    for (;;) {
      const next = await iterator.next();
      if (next.done === true) break;
      await writeRecord(stringifier, flattenForCsv(next.value));
    }
    stringifier.end();
    await completion;
  }

  async error(env: ErrorEnvelope): Promise<void> {
    return writeChunk(this.err, `${JSON.stringify({ schemaVersion: 1, error: env })}\n`);
  }

  private writeArray<T>(rows: T[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (rows.length === 0) {
        this.out.write("", () => resolve());
        return;
      }
      const flat = rows.map((r) => flattenForCsv(r));
      const headers = Object.keys(flat[0] as Record<string, unknown>);
      stringify(flat, csvOptions(headers), (err, str) => {
        if (err) {
          reject(err);
          return;
        }
        writeChunk(this.out, str).then(resolve, reject);
      });
    });
  }

  private pipeStringifier(stringifier: Stringifier): Promise<void> {
    return new Promise((resolve, reject) => {
      stringifier.on("data", (chunk: string | Buffer) => {
        stringifier.pause();
        writeChunk(this.out, chunk.toString()).then(
          () => stringifier.resume(),
          (err: unknown) => reject(err),
        );
      });
      stringifier.once("error", reject);
      stringifier.once("end", resolve);
    });
  }
}

function csvOptions(headers: string[]): Options {
  return {
    header: true,
    columns: headers,
    cast: { object: csvObjectCast },
    escape_formulas: true,
  };
}

function writeRecord(stringifier: Stringifier, record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    stringifier.write(record, (err: Error | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });
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
