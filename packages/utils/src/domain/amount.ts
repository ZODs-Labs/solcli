import { lamports as kitLamports, type Lamports } from "@solana/kit";
import type { Result, TokenAmount } from "@solcli/contracts";
import { ValidationError } from "@solcli/errors";
import { err, ok } from "./result.js";

/**
 * Coerce a non-negative integer to `Lamports`. Wraps Kit's `lamports()` brand
 * producer with two solcli-specific guards: it accepts `number` (auto-promoted
 * to `bigint`) and rejects negative values. Bigint inputs flow through Kit
 * directly so the branding is the canonical Kit brand.
 */
export function lamports(n: bigint | number): Lamports {
  const v = typeof n === "number" ? toBigIntSafe(n) : n;
  if (v < 0n) {
    throw new ValidationError("Lamports cannot be negative", { details: { value: v.toString() } });
  }
  return kitLamports(v);
}

export function tryLamports(n: bigint | number): Result<Lamports, ValidationError> {
  try {
    return ok(lamports(n));
  } catch (e) {
    return err(e as ValidationError);
  }
}

export function tokenAmount(n: bigint | number): TokenAmount {
  const v = typeof n === "number" ? toBigIntSafe(n) : n;
  if (v < 0n) {
    throw new ValidationError("TokenAmount cannot be negative", {
      details: { value: v.toString() },
    });
  }
  return v as TokenAmount;
}

export function addLamports(a: Lamports, b: Lamports): Lamports {
  return lamports((a as bigint) + (b as bigint));
}

export function subLamports(a: Lamports, b: Lamports): Lamports {
  return lamports((a as bigint) - (b as bigint));
}

export function mulLamports(a: Lamports, n: bigint): Lamports {
  return lamports((a as bigint) * n);
}

function toBigIntSafe(n: number): bigint {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ValidationError("Amount must be a finite integer", { details: { value: n } });
  }
  return BigInt(n);
}
