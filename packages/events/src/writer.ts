import type { EmitEventPort, EventRecord } from "@solcli/contracts";
import { redactEventRecord } from "./redactor.js";
import type { EventSink, EventSinkKind } from "./sinks.js";

export interface DebugLogger {
  debug(obj: object, msg: string): void;
}

export interface EventWriterOptions {
  readonly sink: EventSink;
  readonly logger?: DebugLogger;
  readonly redact?: (record: EventRecord) => EventRecord;
}

export interface EventWriter extends EmitEventPort {
  readonly sinkKind: EventSinkKind;
  flush(): Promise<void>;
  close(): Promise<void>;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  return value;
}

function serialize(record: EventRecord): string {
  return `${JSON.stringify(record, bigintReplacer)}\n`;
}

export function createEventWriter(opts: EventWriterOptions): EventWriter {
  const sink = opts.sink;
  const redact = opts.redact ?? redactEventRecord;
  const logger = opts.logger;

  return {
    sinkKind: sink.kind,
    emit(record: EventRecord): void {
      let safe: EventRecord;
      try {
        safe = redact(record);
      } catch (err: unknown) {
        logger?.debug({ err, kind: record.kind }, "emit-redact-error");
        return;
      }
      let line: string;
      try {
        line = serialize(safe);
      } catch (err: unknown) {
        logger?.debug({ err, kind: record.kind }, "emit-serialize-error");
        return;
      }
      try {
        sink.write(line);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code === "EPIPE") {
          logger?.debug({ kind: record.kind }, "emit-epipe");
          return;
        }
        logger?.debug({ err, kind: record.kind }, "emit-error");
      }
    },
    async flush(): Promise<void> {
      try {
        await sink.flush();
      } catch (err: unknown) {
        logger?.debug({ err }, "flush-error");
      }
    },
    async close(): Promise<void> {
      try {
        await sink.close();
      } catch (err: unknown) {
        logger?.debug({ err }, "close-error");
      }
    },
  };
}
