# DataProvider Adapters

solcli abstracts third-party Solana rich-API providers behind the `DataProvider`
interface in `@solcli/contracts`.

## Capability Set

```
getAsset, getAssetsByOwner, searchAssets,
getTokenAccounts, getPortfolio,
getPriorityFeeEstimate, getEnhancedTransactions,
getTransactionHistory, getNftsByOwner, getTokenBalances,
getJupiterQuote, subscribeSignatures
```

The runtime capability list lives in `@solcli/providers`; contracts remain
type-only.

## v0 Status

v0 ships scaffolding only: the `DataProvider` interface, the in-memory registry,
the `FallbackChain` composite and README skeletons for Helius and Triton One.
No concrete adapter is registered in v0. The active provider in default config is
`rpc-only`, a placeholder name that resolves to an empty `FallbackChain`.

## Switching Providers

```bash
solcli config set provider.active helius
```

After v1 ships the Helius adapter, this redirects rich-API calls without command
code changes.

## Adding a New Adapter

1. Create `packages/provider-<vendor>/src/index.ts` exporting a class that
   implements `DataProvider` from `@solcli/contracts`.
2. Register it from the app composition layer (`apps/cli/src/context.ts`) or a
   provider registry helper owned by the app layer.
3. Add vendor docs at `packages/provider-<vendor>/README.md`.

Provider adapter packages must not import other provider adapter packages.
