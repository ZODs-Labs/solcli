import type { ErrorEnvelope, OutputFormatter } from "@solcli/contracts";
import { writeChunk } from "./write-stream.js";

export interface NdjsonFormatterOptions {
  stdout?: NodeJS.WritableStream;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export class NdjsonFormatter implements OutputFormatter {
  private readonly out: NodeJS.WritableStream;

  constructor(opts: NdjsonFormatterOptions = {}) {
    this.out = opts.stdout ?? process.stdout;
  }

  /**
   * NDJSON contract: one JSON value per line.
   *
   * For agent ergonomics, collection-shaped payloads are fanned out:
   *   - `Array<T>`            → one envelope per element
   *   - `{ records: T[], … }` → one envelope per record (other keys dropped)
   *   - anything else         → a single envelope line
   *
   * `writeStream` is always per-record.
   */
  async write<T>(payload: T): Promise<void> {
    if (Array.isArray(payload)) {
      for (const item of payload) {
        await this.writeLine(JSON.stringify({ schemaVersion: 1, data: item }, jsonReplacer));
      }
      return;
    }
    if (payload !== null && typeof payload === "object") {
      const records = (payload as { records?: unknown }).records;
      if (Array.isArray(records)) {
        for (const item of records) {
          await this.writeLine(JSON.stringify({ schemaVersion: 1, data: item }, jsonReplacer));
        }
        return;
      }
    }
    await this.writeLine(JSON.stringify({ schemaVersion: 1, data: payload }, jsonReplacer));
  }

  async writeStream<T>(records: AsyncIterable<T>): Promise<void> {
    for await (const r of records) {
      await this.writeLine(JSON.stringify({ schemaVersion: 1, data: r }, jsonReplacer));
    }
  }

  async error(env: ErrorEnvelope): Promise<void> {
    await this.writeLine(JSON.stringify({ schemaVersion: 1, error: env }, jsonReplacer));
  }

  private writeLine(s: string): Promise<void> {
    return writeChunk(this.out, `${s}\n`);
  }
}
