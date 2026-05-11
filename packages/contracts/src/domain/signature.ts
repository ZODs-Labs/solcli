import type { Blockhash, Signature, Slot, UnixTimestamp } from "@solana/kit";

/**
 * Re-export Kit's chain primitives so domain code does not maintain a
 * parallel brand layer. Anywhere we used to brand a `string` as `Blockhash`
 * or `Signature`, the same value already carries Kit's nominal type.
 */
export type { Blockhash, Signature, Slot, UnixTimestamp };

/**
 * Block height is a plain `bigint` in Kit's RPC types; we expose it under
 * the historical alias for readability without re-branding.
 */
export type BlockHeight = bigint;

/**
 * Backwards-compatible alias for code that still reads `UnixSeconds`.
 * Kit's canonical name is `UnixTimestamp`.
 */
export type UnixSeconds = UnixTimestamp;
