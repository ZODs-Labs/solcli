import { appendFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import type { IntentEnvelope, Pubkey } from "@solcli/contracts";
import type { SignerAdapterKind, SignerAlias, SignerLogger } from "./port.js";

/**
 * One NDJSON record appended per successful sign. The shape is part of the
 * stable contract documented in ADR-0013 and the signer session
 * specification; never rename fields once shipped.
 */
export interface SignerAuditEntry {
  readonly schemaVersion: 1;
  readonly time: string;
  readonly alias: SignerAlias;
  readonly adapter: SignerAdapterKind;
  readonly pubkey: string;
  readonly programs: readonly string[];
  readonly intent: {
    readonly summary: string;
    readonly lamportsDelta: string;
    readonly idempotencyKey: string;
  };
  readonly signature: string;
}

export interface AuditWriteArgs {
  readonly auditDir: string;
  readonly alias: SignerAlias;
  readonly adapter: SignerAdapterKind;
  readonly pubkey: string;
  readonly intent: IntentEnvelope;
  readonly signature: string;
  readonly time: string;
  readonly signal: AbortSignal;
  readonly logger?: SignerLogger;
}

/**
 * Build the audit entry from an intent plus a produced signature. The
 * `programs` list is the unique program ids the intent envelope advertised.
 */
export function buildAuditEntry(args: {
  readonly time: string;
  readonly alias: SignerAlias;
  readonly adapter: SignerAdapterKind;
  readonly pubkey: string;
  readonly intent: IntentEnvelope;
  readonly signature: string;
}): SignerAuditEntry {
  const programs = unique(args.intent.programs.map((p) => p as unknown as string));
  return {
    schemaVersion: 1,
    time: args.time,
    alias: args.alias,
    adapter: args.adapter,
    pubkey: args.pubkey,
    programs,
    intent: {
      summary: args.intent.summary,
      lamportsDelta: (args.intent.lamportsDelta as unknown as bigint).toString(),
      idempotencyKey: args.intent.idempotencyKey,
    },
    signature: args.signature,
  };
}

/**
 * Append one NDJSON line to `<auditDir>/<alias>.ndjson`. Atomic per POSIX
 * `O_APPEND` semantics for payloads under PIPE_BUF; the entry is well below
 * that limit.
 *
 * The audit log is advisory. If the write fails (file mode, missing
 * directory, full disk), we log at `warn` and return; signing must not fail
 * because the log file is unwritable.
 */
export async function appendAudit(args: AuditWriteArgs): Promise<void> {
  args.signal.throwIfAborted();
  const entry = buildAuditEntry({
    time: args.time,
    alias: args.alias,
    adapter: args.adapter,
    pubkey: args.pubkey,
    intent: args.intent,
    signature: args.signature,
  });
  const file = path.join(args.auditDir, `${sanitizeAlias(args.alias)}.ndjson`);
  const line = `${JSON.stringify(entry)}\n`;
  try {
    await mkdir(args.auditDir, { recursive: true, mode: 0o700 });
    await appendFile(file, line, { mode: 0o600, flag: "a" });
    if (process.platform !== "win32") {
      await chmod(file, 0o600).catch(() => {
        // best effort: chmod may race with another writer
      });
    }
  } catch (err: unknown) {
    args.logger?.warn(
      { alias: args.alias, file, err: errMessage(err) },
      "signer audit log write failed; continuing",
    );
  }
}

function unique<T>(input: readonly T[]): readonly T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of input) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function sanitizeAlias(alias: SignerAlias): string {
  // Aliases may not contain path separators or NUL. Keep
  // alphanumerics, dot, dash and underscore; replace anything else with `_`.
  return (alias as unknown as string).replace(/[^A-Za-z0-9._-]/g, "_");
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type { Pubkey };
