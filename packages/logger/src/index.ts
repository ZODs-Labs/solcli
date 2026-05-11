import path from "node:path";
import type { Logger, LogLevel, Paths } from "@solcli/contracts";
import { multistream, type Logger as PinoLogger, pino } from "pino";
// @ts-expect-error pino-roll 3.x ships no type declarations; treated as opaque factory
import pinoRollUntyped from "pino-roll";

interface PinoRollOptions {
  file: string;
  frequency?: string;
  size?: string;
  limit?: { count: number };
  mkdir?: boolean;
}
const pinoRoll = pinoRollUntyped as (opts: PinoRollOptions) => Promise<NodeJS.WritableStream>;

export interface BuildLoggerOptions {
  paths: Paths;
  level: LogLevel;
  verbose?: boolean;
  quiet?: boolean;
}

const REDACT_PATHS = [
  "*.apiKey",
  "*.apikey",
  "*.privateKey",
  "*.privatekey",
  "*.secretKey",
  "*.secretkey",
  "*.password",
  "*.passphrase",
  "*.mnemonic",
  "*.privKey",
  "*.priv_key",
  "headers.authorization",
  "headers.cookie",
  "headers.Authorization",
  "headers.Cookie",
  "*.helius.apiKey",
  "*.triton.apiKey",
];

export async function buildLogger(opts: BuildLoggerOptions): Promise<Logger> {
  return lazyWrap(opts);
}

async function buildPinoLogger(opts: BuildLoggerOptions): Promise<PinoLogger> {
  const logFilePath = path.join(opts.paths.log, "solcli.log");

  const fileStream = await pinoRoll({
    file: logFilePath,
    frequency: "daily",
    size: "10m",
    limit: { count: 7 },
    mkdir: true,
  });

  const streams: { level?: LogLevel; stream: NodeJS.WritableStream }[] = [
    { level: opts.level, stream: fileStream },
  ];

  if (opts.verbose && !opts.quiet) {
    streams.push({ level: "debug", stream: process.stderr });
  } else if (process.stderr.isTTY && !opts.quiet) {
    streams.push({ level: "warn", stream: process.stderr });
  }

  const pinoInstance: PinoLogger = pino(
    {
      level: opts.level,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
      },
      base: { pid: process.pid, hostname: undefined },
    },
    multistream(streams),
  );

  return pinoInstance;
}

function lazyWrap(opts: BuildLoggerOptions): Logger {
  let loggerPromise: Promise<PinoLogger> | undefined;
  const getLogger = (): Promise<PinoLogger> => {
    loggerPromise ??= buildPinoLogger(opts);
    return loggerPromise;
  };

  const write = (
    level: "trace" | "debug" | "info" | "warn" | "error",
    obj?: unknown,
    msg?: string,
  ): void => {
    void getLogger().then((logger) => logger[level](obj as object, msg));
  };

  return {
    trace: (obj, msg) => write("trace", obj, msg),
    debug: (obj, msg) => write("debug", obj, msg),
    info: (obj, msg) => write("info", obj, msg),
    warn: (obj, msg) => write("warn", obj, msg),
    error: (obj, msg) => write("error", obj, msg),
    child: (bindings) => childLazyWrap(getLogger, bindings as Record<string, unknown>),
    flush: async () => {
      const logger = await getLogger();
      await flushPino(logger);
    },
  };
}

function childLazyWrap(
  getParent: () => Promise<PinoLogger>,
  bindings: Record<string, unknown>,
): Logger {
  let childPromise: Promise<PinoLogger> | undefined;
  const getChild = (): Promise<PinoLogger> => {
    childPromise ??= getParent().then((parent) => parent.child(bindings));
    return childPromise;
  };
  const write = (
    level: "trace" | "debug" | "info" | "warn" | "error",
    obj?: unknown,
    msg?: string,
  ): void => {
    void getChild().then((logger) => logger[level](obj as object, msg));
  };
  return {
    trace: (obj, msg) => write("trace", obj, msg),
    debug: (obj, msg) => write("debug", obj, msg),
    info: (obj, msg) => write("info", obj, msg),
    warn: (obj, msg) => write("warn", obj, msg),
    error: (obj, msg) => write("error", obj, msg),
    child: (nextBindings) => childLazyWrap(getChild, nextBindings as Record<string, unknown>),
    flush: async () => {
      const child = await getChild();
      await flushPino(child);
    },
  };
}

function flushPino(p: PinoLogger): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      p.flush?.(() => resolve());
    } catch {
      resolve();
    }
  });
}
