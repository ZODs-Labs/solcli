import type { ErrorEnvelope, OutputFormat, OutputFormatter } from "@solcli/contracts";
import { CsvFormatter, type CsvFormatterOptions } from "./csv.js";
import { HumanFormatter, type HumanFormatterOptions } from "./human.js";
import { JsonFormatter, type JsonFormatterOptions } from "./json.js";
import { NdjsonFormatter, type NdjsonFormatterOptions } from "./ndjson.js";

export interface CreateFormatterOptions {
  format: OutputFormat;
  noColor?: boolean;
  quiet?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function createFormatter(opts: CreateFormatterOptions): OutputFormatter {
  const inner = build(opts);
  if (opts.quiet) return new QuietFormatter(inner);
  return inner;
}

function build(opts: CreateFormatterOptions): OutputFormatter {
  switch (opts.format) {
    case "json": {
      const o: JsonFormatterOptions = {};
      if (opts.stdout !== undefined) o.stdout = opts.stdout;
      return new JsonFormatter(o);
    }
    case "ndjson": {
      const o: NdjsonFormatterOptions = {};
      if (opts.stdout !== undefined) o.stdout = opts.stdout;
      return new NdjsonFormatter(o);
    }
    case "csv": {
      const o: CsvFormatterOptions = {};
      if (opts.stdout !== undefined) o.stdout = opts.stdout;
      if (opts.stderr !== undefined) o.stderr = opts.stderr;
      return new CsvFormatter(o);
    }
    case "human": {
      const o: HumanFormatterOptions = {};
      if (opts.stdout !== undefined) o.stdout = opts.stdout;
      if (opts.stderr !== undefined) o.stderr = opts.stderr;
      if (opts.noColor !== undefined) o.noColor = opts.noColor;
      return new HumanFormatter(o);
    }
    default: {
      const _exhaustive: never = opts.format;
      throw new Error(`Unknown output format: ${_exhaustive as string}`);
    }
  }
}

class QuietFormatter implements OutputFormatter {
  constructor(private readonly inner: OutputFormatter) {}
  async write<T>(_payload: T): Promise<void> {
    /* quiet: suppress */
  }
  async writeStream<T>(_records: AsyncIterable<T>): Promise<void> {
    /* quiet: suppress */
  }
  async error(env: ErrorEnvelope): Promise<void> {
    return this.inner.error(env);
  }
}
