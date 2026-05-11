import { createWriteStream, constants as fsConstants, fstatSync, type WriteStream } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";

export type EventSinkKind = "stdout" | "fd3" | "devnull" | "file";

export interface EventSink {
  readonly kind: EventSinkKind;
  write(line: string): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface Fd3SinkOptions {
  readonly onUnavailable?: () => void;
  readonly createStream?: () => WriteStream;
}

export function createStdoutSink(): EventSink {
  return {
    kind: "stdout",
    write(line: string): void {
      process.stdout.write(line);
    },
    async flush(): Promise<void> {
      await new Promise<void>((resolve) => {
        if (process.stdout.writableNeedDrain) {
          process.stdout.once("drain", () => resolve());
          return;
        }
        resolve();
      });
    },
    async close(): Promise<void> {
      // process.stdout is owned by the runtime; never close it here.
    },
  };
}

export function createDevnullSink(): EventSink {
  return {
    kind: "devnull",
    write(_line: string): void {
      // intentional no-op
    },
    async flush(): Promise<void> {
      // intentional no-op
    },
    async close(): Promise<void> {
      // intentional no-op
    },
  };
}

export function createFd3Sink(opts: Fd3SinkOptions = {}): EventSink {
  const factory =
    opts.createStream ??
    ((): WriteStream => {
      fstatSync(3);
      return createWriteStream("", { fd: 3 });
    });
  let stream: WriteStream | undefined;
  try {
    stream = factory();
  } catch {
    opts.onUnavailable?.();
    return createDevnullSink();
  }
  let unavailableReported = false;
  const reportUnavailable = (): void => {
    if (unavailableReported) return;
    unavailableReported = true;
    opts.onUnavailable?.();
  };
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EBADF" || err.code === "EPIPE") {
      reportUnavailable();
      return;
    }
    reportUnavailable();
  });
  return {
    kind: "fd3",
    write(line: string): void {
      try {
        stream?.write(line);
      } catch {
        reportUnavailable();
      }
    },
    async flush(): Promise<void> {
      const s = stream;
      if (!s) return;
      await new Promise<void>((resolve) => {
        if (s.writableNeedDrain) {
          s.once("drain", () => resolve());
          return;
        }
        resolve();
      });
    },
    async close(): Promise<void> {
      const s = stream;
      if (!s) return;
      await new Promise<void>((resolve) => {
        s.end(() => resolve());
      });
    },
  };
}

export function createFileSink(filePath: string): EventSink {
  let handle: FileHandle | undefined;
  let opening: Promise<FileHandle> | undefined;
  let chain: Promise<void> = Promise.resolve();
  const mode = process.platform === "win32" ? undefined : 0o600;

  function getHandle(): Promise<FileHandle> {
    if (handle) return Promise.resolve(handle);
    if (opening) return opening;
    const flags = fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_WRONLY;
    opening = open(filePath, flags, mode).then((h) => {
      handle = h;
      return h;
    });
    return opening;
  }

  async function appendOne(line: string): Promise<void> {
    const h = await getHandle();
    await h.appendFile(line);
  }

  return {
    kind: "file",
    write(line: string): void {
      chain = chain.then(() => appendOne(line)).catch(() => undefined);
    },
    async flush(): Promise<void> {
      await chain;
      if (handle) {
        try {
          await handle.sync();
        } catch {
          // best-effort flush
        }
      }
    },
    async close(): Promise<void> {
      await chain;
      if (handle) {
        try {
          await handle.close();
        } catch {
          // best-effort close
        }
        handle = undefined;
      }
    },
  };
}

export interface PickSinkOptions {
  readonly agentMode: boolean;
  readonly eventsFlag?: "ndjson" | "off" | "file";
  readonly filePath?: string;
  readonly onFd3Unavailable?: () => void;
  readonly fd3StreamFactory?: () => WriteStream;
}

export function pickSink(opts: PickSinkOptions, _env: NodeJS.ProcessEnv): EventSink {
  if (opts.eventsFlag === "ndjson") {
    return createStdoutSink();
  }
  if (opts.agentMode) {
    const fd3Opts: Fd3SinkOptions = {};
    if (opts.onFd3Unavailable) {
      (fd3Opts as { onUnavailable?: () => void }).onUnavailable = opts.onFd3Unavailable;
    }
    if (opts.fd3StreamFactory) {
      (fd3Opts as { createStream?: () => WriteStream }).createStream = opts.fd3StreamFactory;
    }
    return createFd3Sink(fd3Opts);
  }
  if (opts.eventsFlag === "file" && opts.filePath) {
    return createFileSink(opts.filePath);
  }
  return createDevnullSink();
}
