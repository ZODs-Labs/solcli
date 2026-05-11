import type { Blockhash, Result, Signature } from "@solcli/contracts";
import { ValidationError } from "@solcli/errors";
import { isPubkeyString } from "./pubkey.js";
import { err, ok } from "./result.js";

const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export function isSignatureString(s: string): boolean {
  return SIGNATURE_RE.test(s);
}

export function signature(s: string): Signature {
  if (!isSignatureString(s)) {
    throw new ValidationError("Invalid signature: expected base58 64-90 chars", {
      details: { length: s.length },
    });
  }
  return s as Signature;
}

export function trySignature(s: string): Result<Signature, ValidationError> {
  if (!isSignatureString(s)) {
    return err(
      new ValidationError("Invalid signature: expected base58 64-90 chars", {
        details: { length: s.length },
      }),
    );
  }
  return ok(s as Signature);
}

export function blockhash(s: string): Blockhash {
  if (!isPubkeyString(s)) {
    throw new ValidationError("Invalid blockhash: expected base58 32-44 chars", {
      details: { length: s.length },
    });
  }
  return s as Blockhash;
}
