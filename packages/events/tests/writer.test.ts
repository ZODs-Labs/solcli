import type { EventRecord } from "@solcli/contracts";
import { describe, expect, it, vi } from "vitest";
import type { EventSink } from "../src/sinks.js";
import { createEventWriter } from "../src/writer.js";

function recordingSink(): { sink: EventSink; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    sink: {
      kind: "stdout",
      write(line: string): void {
        lines.push(line);
      },
      flush: async (): Promise<void> => undefined,
      close: async (): Promise<void> => undefined,
    },
  };
}

function throwingSink(code: string): EventSink {
  return {
    kind: "stdout",
    write(_line: string): void {
      const err: NodeJS.ErrnoException = new Error("write failed");
      err.code = code;
      throw err;
    },
    flush: async (): Promise<void> => undefined,
    close: async (): Promise<void> => undefined,
  };
}

describe("createEventWriter", () => {
  it("serializes records as NDJSON with bigint suffixing", () => {
    const { sink, lines } = recordingSink();
    const writer = createEventWriter({ sink });
    const record: EventRecord<"tx.sent", { lamports: bigint; note: string }> = {
      schemaVersion: 1,
      kind: "tx.sent",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: { lamports: 12345n, note: "ok" },
    };
    writer.emit(record);
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line) as {
      kind: string;
      data: { lamports: string; note: string };
    };
    expect(parsed.kind).toBe("tx.sent");
    expect(parsed.data.lamports).toBe("12345n");
    expect(parsed.data.note).toBe("ok");
  });

  it("propagates sinkKind from the underlying sink", () => {
    const { sink } = recordingSink();
    const writer = createEventWriter({ sink });
    expect(writer.sinkKind).toBe("stdout");
  });

  it("swallows EPIPE and logs at debug level without throwing", () => {
    const logger = { debug: vi.fn() };
    const writer = createEventWriter({ sink: throwingSink("EPIPE"), logger });
    const record: EventRecord<"tx.failed", { reason: string }> = {
      schemaVersion: 1,
      kind: "tx.failed",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: { reason: "downstream-closed" },
    };
    expect(() => writer.emit(record)).not.toThrow();
    expect(logger.debug).toHaveBeenCalledTimes(1);
    const call = logger.debug.mock.calls[0];
    expect(call?.[1]).toBe("emit-epipe");
  });

  it("swallows non-EPIPE write errors with a separate debug entry", () => {
    const logger = { debug: vi.fn() };
    const writer = createEventWriter({ sink: throwingSink("EIO"), logger });
    const record: EventRecord<"tx.failed", Record<string, never>> = {
      schemaVersion: 1,
      kind: "tx.failed",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: {},
    };
    expect(() => writer.emit(record)).not.toThrow();
    expect(logger.debug).toHaveBeenCalledTimes(1);
    const call = logger.debug.mock.calls[0];
    expect(call?.[1]).toBe("emit-error");
  });

  it("passes records through the supplied redactor before emit", () => {
    const { sink, lines } = recordingSink();
    const writer = createEventWriter({
      sink,
      redact: (r) => ({ ...r, data: { redacted: true } }),
    });
    const record: EventRecord<"tx.sent", { apiKey: string }> = {
      schemaVersion: 1,
      kind: "tx.sent",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: { apiKey: "super-secret" },
    };
    writer.emit(record);
    const parsed = JSON.parse(lines[0] ?? "") as { data: { redacted: boolean } };
    expect(parsed.data.redacted).toBe(true);
  });
});
