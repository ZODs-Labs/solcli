export type OutputFormat = "human" | "json" | "ndjson" | "csv";

/** Stable JSON envelope for any error surfaced to stdout/stderr in JSON modes. */
export interface ErrorEnvelope {
  schemaVersion: 1;
  code: string;
  message: string;
  exitCode: number;
  details?: Record<string, unknown>;
  cause?: ErrorEnvelope | null;
}

/** Stable JSON envelope for success payloads. */
export interface SuccessEnvelope<T> {
  schemaVersion: 1;
  data: T;
}

/** Pluggable output formatter (human/json/ndjson/csv). Implemented by S2. */
export interface OutputFormatter {
  write<T>(payload: T): Promise<void>;
  writeStream<T>(records: AsyncIterable<T>): Promise<void>;
  error(env: ErrorEnvelope): Promise<void>;
}
