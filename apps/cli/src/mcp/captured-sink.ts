import { Buffer } from "node:buffer";
import { Writable } from "node:stream";
import { createFormatter } from "@solcli/output";
import type { Context } from "../context.js";

export interface CapturedSink {
  readonly sink: NodeJS.WritableStream;
  readAll(): string;
}

export function createCapturedSink(): CapturedSink {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
      cb();
    },
  });
  return {
    sink,
    readAll(): string {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

// Runs `fn` with `ctx.output` replaced by a JSON formatter that writes to an
// in-memory sink; restores the original formatter in `finally`. MCP tool
// dispatches are serialized through the server request loop so a simple
// mutation-and-restore is safe; spawning a parallel `withContext` scope is
// unsafe because the AsyncLocalStorage instance is module-private to
// `context.ts`.
export async function withCapturedOutput<T>(
  ctx: Context,
  fn: (readCaptured: () => string) => Promise<T>,
): Promise<T> {
  const captured = createCapturedSink();
  const formatter = createFormatter({ format: "json", stdout: captured.sink });
  const previousOutput = ctx.output;
  ctx.output = formatter;
  try {
    return await fn(() => captured.readAll());
  } finally {
    ctx.output = previousOutput;
  }
}
