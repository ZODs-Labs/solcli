import type {
  Lamports,
  Pubkey,
  Signature,
  SignedTransaction,
  SubmitBundlePort,
} from "@solcli/contracts";

export interface BundleSubmitOptions {
  readonly tipAccount: Pubkey;
  readonly tipLamports: Lamports;
  readonly signal: AbortSignal;
}

export async function submitBundle(
  port: SubmitBundlePort,
  signed: SignedTransaction,
  opts: BundleSubmitOptions,
): Promise<Signature> {
  opts.signal.throwIfAborted();
  const sigs = await port.submit(
    {
      transactions: [signed],
      tipAccount: opts.tipAccount,
      tipLamports: opts.tipLamports,
    },
    { signal: opts.signal },
  );
  const first = sigs[0];
  if (first === undefined) {
    throw new Error("Bundle submit returned no signatures");
  }
  return first;
}
