import type {
  AccountMeta,
  Address,
  Instruction,
  MicroLamports,
  TransactionMessage,
  TransactionMessageWithBlockhashLifetime,
  TransactionMessageWithFeePayer,
} from "@solana/kit";

/**
 * The Solana transaction-message types come from `@solana/kit` verbatim;
 * this module re-exports them under domain-friendly names. There is no
 * parallel transaction shape in this codebase.
 */
export type { AccountMeta, Instruction, TransactionMessage };

/**
 * The "signable" form: a Kit `TransactionMessage` that has a fee payer and
 * a blockhash lifetime set, which is the minimum invariant Kit's
 * `compileTransaction` requires. The signer takes this; pre-signing
 * pipeline stages return it.
 */
export type SignableTransactionMessage = TransactionMessage &
  TransactionMessageWithFeePayer &
  TransactionMessageWithBlockhashLifetime;

/**
 * Planning-time metadata for a transaction that is not part of the wire
 * message: priority-fee target, compute-unit budget, expected signers and
 * free-form tags. Carried alongside the `TransactionMessage` and consumed
 * by the safety + fee + intent layers.
 */
export interface PlanMetadata {
  readonly priorityFeeMicroLamportsPerCu?: MicroLamports;
  readonly computeUnitLimit?: number;
  readonly expectedSigners?: readonly Address[];
  readonly tags?: Readonly<Record<string, string>>;
}
