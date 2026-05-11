import { createHash, timingSafeEqual } from "node:crypto";
import { PluginIntegrityMismatchError } from "@solcli/errors";

const INTEGRITY_PATTERN = /^sha384-([A-Za-z0-9+/]+=*)$/;

/**
 * Compute the Subresource-Integrity-style SHA-384 hash of a tarball. The
 * returned string is `sha384-<base64>`; both the algorithm tag and the
 * encoding match what ADR-0012 records in `solcli.config.toml`.
 */
export function computeSha384(tarballBytes: Uint8Array): string {
  const hash = createHash("sha384");
  hash.update(tarballBytes);
  return `sha384-${hash.digest("base64")}`;
}

/**
 * Verify that the tarball hash matches the SRI-format expected value. Throws
 * `SOLCLI_E_PLUGIN_INTEGRITY_MISMATCH` on mismatch. The compare uses
 * `crypto.timingSafeEqual` to keep the integrity check timing-independent.
 */
export function verifyIntegrity(tarballBytes: Uint8Array, expectedHash: string): void {
  const expectedMatch = INTEGRITY_PATTERN.exec(expectedHash);
  if (expectedMatch === null) {
    throw new PluginIntegrityMismatchError(
      "Plugin integrity hash is not in sha384-<base64> Subresource-Integrity format",
      { details: { expected: expectedHash } },
    );
  }
  const expectedB64 = expectedMatch[1] as string;
  let expectedBytes: Buffer;
  try {
    expectedBytes = Buffer.from(expectedB64, "base64");
  } catch (err: unknown) {
    throw new PluginIntegrityMismatchError("Plugin integrity hash base64 payload is invalid", {
      details: { expected: expectedHash },
      cause: err as Error,
    });
  }
  const actualBytes = createHash("sha384").update(tarballBytes).digest();
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    const actualHash = `sha384-${actualBytes.toString("base64")}`;
    throw new PluginIntegrityMismatchError(
      "Plugin tarball SHA-384 does not match the integrity hash pinned in the config",
      { details: { expected: expectedHash, actual: actualHash } },
    );
  }
}
