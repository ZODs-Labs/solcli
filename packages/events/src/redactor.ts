import type { EventRecord } from "@solcli/contracts";

const ALLOWLIST_FIELDS: ReadonlySet<string> = new Set([
  "apikey",
  "secretkey",
  "privatekey",
  "mnemonic",
  "seedphrase",
  "authorization",
  "cookie",
  "keypair",
  "signer",
  "keydata",
  "secretrecoveryphrase",
]);

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,}$/;

const REDACTED_FIELD = "<redacted>";
const REDACTED_BASE58 = "<redacted-base58>";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAllowlistKey(key: string): boolean {
  return ALLOWLIST_FIELDS.has(normalizeKey(key));
}

function redactString(value: string): string {
  if (BASE58_REGEX.test(value)) {
    return REDACTED_BASE58;
  }
  return value;
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      if (isAllowlistKey(key)) {
        out[key] = REDACTED_FIELD;
        continue;
      }
      out[key] = redactValue(child);
    }
    return out;
  }
  return value;
}

export function redactEventRecord(record: EventRecord): EventRecord {
  const cloned = structuredClone(record);
  const safeData = redactValue(cloned.data);
  return {
    schemaVersion: cloned.schemaVersion,
    kind: cloned.kind,
    time: cloned.time,
    requestId: cloned.requestId,
    data: safeData,
  };
}
