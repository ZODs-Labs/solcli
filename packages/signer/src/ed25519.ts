import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { InternalError, ValidationError } from "@solcli/errors";

/**
 * PKCS#8 DER prefix for an Ed25519 private key (RFC 8410), followed
 * verbatim by the 32-byte seed. This lets us load the key into
 * `node:crypto` without pulling a third-party Ed25519 library.
 */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

function keyFromSeed(seed: Uint8Array) {
  if (seed.length !== 32) {
    throw new ValidationError(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const der = Buffer.concat([Buffer.from(PKCS8_ED25519_PREFIX), Buffer.from(seed)]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/** Ed25519 sign over `message` with the 32-byte seed. Returns 64 bytes. */
export function ed25519Sign(seed: Uint8Array, message: Uint8Array): Uint8Array {
  const key = keyFromSeed(seed);
  return new Uint8Array(cryptoSign(null, Buffer.from(message), key));
}

/** Derive the 32-byte Ed25519 public key from a 32-byte seed. */
export function ed25519PubkeyFromSeed(seed: Uint8Array): Uint8Array {
  const key = keyFromSeed(seed);
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (jwk.x === undefined) {
    throw new InternalError("Ed25519 JWK missing public component");
  }
  return new Uint8Array(Buffer.from(jwk.x, "base64url"));
}

/**
 * Accept either a 32-byte seed or a 64-byte Solana keypair blob
 * (seed || pubkey) and return the 32-byte seed.
 */
export function extractSeed(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return new Uint8Array(bytes);
  if (bytes.length === 64) return new Uint8Array(bytes.subarray(0, 32));
  throw new ValidationError(
    `Expected 32-byte seed or 64-byte keypair blob, got ${bytes.length} bytes`,
  );
}
