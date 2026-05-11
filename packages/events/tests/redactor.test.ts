import type { EventRecord } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { redactEventRecord } from "../src/redactor.js";

describe("redactEventRecord", () => {
  it("redacts allowlist fields and base58 strings while preserving normal data", () => {
    const base58 = "3aD2yLk3yWqz9X8mZ1pQrSt4uV5wXyZaBcDeFgHjKmN1";
    const record: EventRecord<
      "tx.signed",
      {
        apiKey: string;
        Authorization: string;
        signature: string;
        memo: string;
        meta: { secretKey: string };
      }
    > = {
      schemaVersion: 1,
      kind: "tx.signed",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: {
        apiKey: "abcdef",
        Authorization: "Bearer xyz",
        signature: base58,
        memo: "hello world",
        meta: { secretKey: "raw-key" },
      },
    };

    const out = redactEventRecord(record);
    const data = out.data as {
      apiKey: string;
      Authorization: string;
      signature: string;
      memo: string;
      meta: { secretKey: string };
    };
    expect(data.apiKey).toBe("<redacted>");
    expect(data.Authorization).toBe("<redacted>");
    expect(data.signature).toBe("<redacted-base58>");
    expect(data.memo).toBe("hello world");
    expect(data.meta.secretKey).toBe("<redacted>");
  });

  it("does not mutate the input record", () => {
    const record: EventRecord<"tx.sent", { apiKey: string }> = {
      schemaVersion: 1,
      kind: "tx.sent",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: { apiKey: "leak" },
    };
    const before = JSON.stringify(record);
    redactEventRecord(record);
    expect(JSON.stringify(record)).toBe(before);
  });

  it("leaves short base58-shaped strings untouched", () => {
    const record: EventRecord<"tx.sent", { short: string }> = {
      schemaVersion: 1,
      kind: "tx.sent",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: { short: "abc123" },
    };
    const out = redactEventRecord(record);
    const data = out.data as { short: string };
    expect(data.short).toBe("abc123");
  });

  it("walks arrays of objects and redacts inner secrets", () => {
    const record: EventRecord<"tx.sent", { signers: Array<{ keypair: string; tag: string }> }> = {
      schemaVersion: 1,
      kind: "tx.sent",
      time: "2026-05-11T00:00:00.000Z",
      requestId: "r_test",
      data: {
        signers: [
          { keypair: "raw-bytes", tag: "primary" },
          { keypair: "more-bytes", tag: "fee-payer" },
        ],
      },
    };
    const out = redactEventRecord(record);
    const data = out.data as { signers: Array<{ keypair: string; tag: string }> };
    expect(data.signers[0]?.keypair).toBe("<redacted>");
    expect(data.signers[0]?.tag).toBe("primary");
    expect(data.signers[1]?.keypair).toBe("<redacted>");
    expect(data.signers[1]?.tag).toBe("fee-payer");
  });
});
