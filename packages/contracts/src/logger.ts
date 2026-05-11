export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** Structured logger. NDJSON to log file + optional pretty stderr. Implemented by S0. */
export interface Logger {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
  flush(): Promise<void>;
}
