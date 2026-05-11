import type {
  Pubkey,
  Signature,
  SignedTransaction,
  TransactionPlan,
  TransactionSignature,
} from "@solcli/contracts";
import { appendAudit } from "../audit.js";
import { base58Encode } from "../base58.js";
import { ed25519PubkeyFromSeed, ed25519Sign, extractSeed } from "../ed25519.js";
import type {
  SignerAdapterKind,
  SignerAlias,
  SignerInitDeps,
  SignTransactionOptions,
} from "../port.js";
import { serializeMessage } from "../serialize.js";

export interface SignWithKeyBytesArgs {
  readonly alias: SignerAlias;
  readonly adapter: SignerAdapterKind;
  readonly plan: TransactionPlan;
  readonly opts: SignTransactionOptions;
  readonly deps: SignerInitDeps;
  readonly keyBytes: Uint8Array;
}

/**
 * Shared post-decrypt pipeline used by every functional adapter:
 *   1. Honor the abort signal.
 *   2. Emit an `intent.emitted` event so downstream consumers see the
 *      intent before any signature material exists.
 *   3. Sign the serialized message.
 *   4. Zero the key bytes in-place.
 *   5. Append an audit-log line (best effort; never gates success).
 *   6. Return a `SignedTransaction`.
 *
 * The caller owns `keyBytes` allocation. After this function returns, the
 * buffer has been overwritten with zeros and must not be used.
 */
export async function signWithKeyBytes(args: SignWithKeyBytesArgs): Promise<SignedTransaction> {
  const { alias, adapter, plan, opts, deps, keyBytes } = args;
  opts.signal.throwIfAborted();

  const time = new Date(deps.clock()).toISOString();
  const requestId = deps.newRequestId();

  if (deps.events !== undefined) {
    deps.events.emit({
      schemaVersion: 1,
      kind: "intent.emitted",
      time,
      requestId,
      data: opts.intent,
    });
  }

  const message = serializeMessage(plan);

  let seed: Uint8Array | undefined;
  let signature: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    opts.signal.throwIfAborted();
    seed = extractSeed(keyBytes);
    pubkeyBytes = await ed25519PubkeyFromSeed(seed);
    signature = await ed25519Sign(seed, message);
  } finally {
    // Zero the original buffer regardless of success so secret bytes do
    // not linger when the adapter throws.
    keyBytes.fill(0);
    if (seed !== undefined && seed.buffer !== keyBytes.buffer) {
      seed.fill(0);
    }
  }

  const signatureB58 = base58Encode(signature) as unknown as Signature;
  const pubkeyB58 = base58Encode(pubkeyBytes) as unknown as Pubkey;

  const txSig: TransactionSignature = { signer: pubkeyB58, signature: signatureB58 };
  const signed: SignedTransaction = {
    version: 0,
    payer: plan.payer,
    serializedMessage: message,
    signatures: [txSig],
  };

  await appendAudit({
    auditDir: deps.platform.auditDir(),
    alias,
    adapter,
    pubkey: pubkeyB58 as unknown as string,
    intent: opts.intent,
    signature: signatureB58 as unknown as string,
    time,
    signal: opts.signal,
    logger: deps.logger,
  });

  return signed;
}
