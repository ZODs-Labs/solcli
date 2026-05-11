import { createPrivateKeyFromBytes, getPublicKeyFromPrivateKey, signBytes } from "@solana/kit";
import { ValidationError } from "@solcli/errors";

/**
 * Accept either a 32-byte ed25519 seed or a 64-byte Solana keypair blob
 * (seed || pubkey) and return the 32-byte seed.
 */
export function extractSeed(keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length === 32) return keyBytes;
  if (keyBytes.length === 64) return keyBytes.subarray(0, 32);
  throw new ValidationError(`Ed25519 key must be 32 or 64 bytes, got ${keyBytes.length}`);
}

/** Derive the 32-byte Ed25519 public key from a 32-byte seed. */
export async function ed25519PubkeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== 32) {
    throw new ValidationError(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = await createPrivateKeyFromBytes(seed, true);
  const publicKey = await getPublicKeyFromPrivateKey(privateKey, true);
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return new Uint8Array(raw);
}

/** Ed25519 sign over `message` with the 32-byte seed. Returns 64 bytes. */
export async function ed25519Sign(seed: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== 32) {
    throw new ValidationError(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = await createPrivateKeyFromBytes(seed);
  const signature = await signBytes(privateKey, message);
  return new Uint8Array(signature);
}
