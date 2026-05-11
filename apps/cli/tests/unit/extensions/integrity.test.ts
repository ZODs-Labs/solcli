import { createHash } from "node:crypto";
import { ERROR_CODES, PluginIntegrityMismatchError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { computeSha384, verifyIntegrity } from "../../../src/extensions/integrity.js";

function fixtureBytes(payload: string): Uint8Array {
  return new TextEncoder().encode(payload);
}

describe("integrity", () => {
  const sample = fixtureBytes("solcli plugin fixture tarball v1");

  it("computeSha384 returns sha384-<base64>", () => {
    const expected = `sha384-${createHash("sha384").update(sample).digest("base64")}`;
    expect(computeSha384(sample)).toBe(expected);
  });

  it("round-trips against verifyIntegrity", () => {
    const hash = computeSha384(sample);
    expect(() => verifyIntegrity(sample, hash)).not.toThrow();
  });

  it("rejects a mismatched hash with SOLCLI_E_PLUGIN_INTEGRITY_MISMATCH", () => {
    const wrong = `sha384-${createHash("sha384").update(fixtureBytes("a different payload")).digest("base64")}`;
    let thrown: unknown;
    try {
      verifyIntegrity(sample, wrong);
    } catch (err: unknown) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PluginIntegrityMismatchError);
    expect((thrown as PluginIntegrityMismatchError).code).toBe(
      ERROR_CODES.PLUGIN_INTEGRITY_MISMATCH,
    );
  });

  it("rejects an integrity string not in sha384-<base64> form", () => {
    expect(() => verifyIntegrity(sample, "md5-abcd")).toThrow(PluginIntegrityMismatchError);
  });
});
