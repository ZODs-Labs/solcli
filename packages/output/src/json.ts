import type { ErrorEnvelope, OutputFormatter, SuccessEnvelope } from "@solcli/contracts";

export interface JsonFormatterOptions {
  stdout?: NodeJS.WritableStream;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export class JsonFormatter implements OutputFormatter {
  private readonly out: NodeJS.WritableStream;

  constructor(opts: JsonFormatterOptions = {}) {
    this.out = opts.stdout ?? process.stdout;
  }

  async write<T>(payload: T): Promise<void> {
    const envelope: SuccessEnvelope<T> = { schemaVersion: 1, data: payload };
    await this.writeRaw(JSON.stringify(envelope, jsonReplacer));
  }

  async writeStream<T>(records: AsyncIterable<T>): Promise<void> {
    const items: T[] = [];
    for await (const r of records) items.push(r);
    await this.write(items);
  }

  async error(env: ErrorEnvelope): Promise<void> {
    await this.writeRaw(JSON.stringify({ schemaVersion: 1, error: env }, jsonReplacer));
  }

  private writeRaw(s: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.out.write(`${s}\n`, (err) => (err ? reject(err) : resolve()));
    });
  }
}
