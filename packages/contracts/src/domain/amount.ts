import type { Lamports, MicroLamports, Sol } from "@solana/kit";
import type { Brand } from "./brand.js";

/**
 * Re-export Kit's amount primitives (`Lamports`, `Sol`, `MicroLamports`).
 * Kit ships nominal types with the right semantics; we do not maintain
 * a parallel brand layer.
 */
export type { Lamports, MicroLamports, Sol };

/**
 * Per-mint token amount, expressed in the raw on-chain units of that
 * specific mint (i.e. before applying the mint's `decimals`). Kit has no
 * matching nominal type, so we keep a domain brand to prevent accidental
 * cross-mint arithmetic.
 */
export type TokenAmount = Brand<bigint, "TokenAmount">;
