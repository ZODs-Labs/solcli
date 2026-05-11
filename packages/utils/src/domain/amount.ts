import type { Lamports, Result, Sol, TokenAmount } from "@solcli/contracts";
import { ValidationError } from "@solcli/errors";
import { err, ok } from "./result.js";

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function lamports(n: bigint | number): Lamports {
  const v = typeof n === "number" ? toBigIntSafe(n) : n;
  if (v < 0n) {
    throw new ValidationError("Lamports cannot be negative", { details: { value: v.toString() } });
  }
  return v as Lamports;
}

export function tryLamports(n: bigint | number): Result<Lamports, ValidationError> {
  try {
    return ok(lamports(n));
  } catch (e) {
    return err(e as ValidationError);
  }
}

export function sol(n: number): Sol {
  if (!Number.isFinite(n)) {
    throw new ValidationError("Sol value must be finite", { details: { value: n } });
  }
  if (n < 0) {
    throw new ValidationError("Sol cannot be negative", { details: { value: n } });
  }
  return n as Sol;
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

export function solToLamports(s: Sol): Lamports {
  const value = (s as number) * Number(LAMPORTS_PER_SOL);
  return lamports(Math.round(value));
}

export function lamportsToSol(l: Lamports): Sol {
  const num = Number(l as bigint) / Number(LAMPORTS_PER_SOL);
  return num as Sol;
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
