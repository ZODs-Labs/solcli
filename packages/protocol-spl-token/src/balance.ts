import type {
  GetTokenBalancesPort,
  MintAddress,
  OwnerAddress,
  TokenAmount,
} from "@solcli/contracts";

export interface GetTokenBalanceArgs {
  readonly owner: OwnerAddress;
  readonly mint: MintAddress;
  readonly signal: AbortSignal;
}

export interface GetTokenBalanceDeps {
  readonly getTokenBalances: GetTokenBalancesPort;
}

/**
 * Resolve the on-chain token balance for a single (owner, mint) pair.
 *
 * Calls the GetTokenBalancesPort for the owner; filters the returned list by
 * mint and returns the matching TokenAmount. An empty or unmatched list
 * resolves to 0n branded as TokenAmount (consistent with the on-chain
 * semantic of an absent token account).
 */
export async function getTokenBalance(
  args: GetTokenBalanceArgs,
  deps: GetTokenBalanceDeps,
): Promise<TokenAmount> {
  args.signal.throwIfAborted();
  const balances = await deps.getTokenBalances.getTokenBalances(args.owner, {
    signal: args.signal,
  });
  for (const entry of balances) {
    if (entry.mint === args.mint) {
      return entry.amount;
    }
  }
  return 0n as TokenAmount;
}
