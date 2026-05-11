import type {
  MintAddress,
  OwnerAddress,
  ProgramId,
  Pubkey,
  Result,
  TokenAccount,
} from "@solcli/contracts";
import { ValidationError } from "@solcli/errors";
import { err, ok } from "./result.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RE = new RegExp(`^[${BASE58_ALPHABET}]{32,44}$`);

export function isPubkeyString(s: string): boolean {
  return BASE58_RE.test(s);
}

export function pubkey(s: string): Pubkey {
  if (!isPubkeyString(s)) {
    throw new ValidationError(`Invalid pubkey: expected base58 32-44 chars`, {
      details: { value: s, length: s.length },
    });
  }
  return s as Pubkey;
}

export function tryPubkey(s: string): Result<Pubkey, ValidationError> {
  if (!isPubkeyString(s)) {
    return err(
      new ValidationError(`Invalid pubkey: expected base58 32-44 chars`, {
        details: { value: s, length: s.length },
      }),
    );
  }
  return ok(s as Pubkey);
}

export function asMintAddress(p: Pubkey): MintAddress {
  return p as MintAddress;
}

export function asOwnerAddress(p: Pubkey): OwnerAddress {
  return p as OwnerAddress;
}

export function asProgramId(p: Pubkey): ProgramId {
  return p as ProgramId;
}

export function asTokenAccount(p: Pubkey): TokenAccount {
  return p as TokenAccount;
}

export function eqPubkey(a: Pubkey, b: Pubkey): boolean {
  return (a as string) === (b as string);
}
