# ADR-0003: Anti-Corruption Layer per vendor adapter

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0002](./0002-one-port-per-operation.md).

## Context

Each Solana RPC / indexer vendor exposes its own request shape, response
shape, error model, pagination scheme and naming conventions. The
differences are not cosmetic:

- **Helius DAS** returns a portfolio aggregated by mint with vendor-specific metadata fields (`grouping`, `compression`, `interface`).
- **Triton** may expose a lower-level RPC plus gRPC streams.
- **Public RPC** returns the canonical JSON-RPC shape.

If vendor types leak into the application, two consequences follow:

1. Commands accidentally depend on Helius shapes; switching to Triton is a code change in every command.
2. Vendor schema drift (Helius adds a field, removes a field, renames a field) ripples through the codebase.

## Decision

Every vendor adapter wraps the vendor's SDK in an **Anti-Corruption Layer**.
The ACL:

- Accepts domain types as input (`Pubkey`, not `string`).
- Calls the vendor SDK.
- Validates the response with a Zod schema (in `_mapping/`).
- Returns the domain type (`Portfolio`, `Asset`, `TokenBalance`).
- Maps vendor errors to typed `SolcliError` subclasses.

The vendor SDK types and the Zod schemas live in the vendor folder. Nothing
outside the vendor folder may import them.

```
packages/providers/src/vendors/helius/
├── client.ts                          # Vendor SDK wrapper
├── ports/
│   └── get-portfolio.ts               # ACL: HeliusPortfolioRaw → Portfolio
└── _mapping/
    ├── portfolio.ts                   # Zod schema for raw, mapping fn
    └── portfolio.fixture.json         # Recorded vendor response for tests
```

## Consequences

### Positive

- **Vendor schema drift is contained.** A breaking change in Helius's DAS response causes a test failure in `_mapping/portfolio.ts` (red), not silent corruption downstream.
- **The application core uses domain types only.** Commands, operations and the registry never see Helius's raw shape.
- **Vendor errors become first-class typed errors.** A 429 from Helius becomes `RpcRateLimitError` with `vendor: "helius"` in details; a malformed response becomes `ProviderError` with `vendor` and `expected` fields.
- **Testing is offline.** Recorded vendor responses (msw fixtures) drive ACL unit tests; no live API calls in CI.

### Negative

- **Boilerplate at the port boundary.** Each port has a small mapping function. Mitigated by per-vendor `_mapping/` helpers and Zod's schema inference.
- **Vendor-specific fields are lost** when not mapped. This is intentional: domain types are the contract. If a vendor-specific field has no domain equivalent, it surfaces only through the vendor's escape-hatch command (see ADR-0004).

## Rules

1. **Files under `packages/providers/src/vendors/<vendor>/**`** are the only files allowed to import that vendor's SDK package (e.g. `helius-sdk`, `@triton-one/<x>`).
2. **The ACL must Zod-parse every vendor response** before mapping. Unparseable responses become `ProviderError`.
3. **Mapping functions live in `_mapping/`** and have unit tests with recorded fixtures.
4. **Domain types never reference vendor-specific concepts** (no `heliusGrouping?: HeliusGrouping` on `Asset`). If two vendors expose conceptually distinct things, model two domain types.

## Alternatives considered

### A. Pass vendor types straight through

`getPortfolio` returns `HeliusPortfolioRaw`. Rejected:

- Commands become vendor-specific by accident.
- The polymorphic-provider story collapses: each command must know which vendor produced its data.
- Caching becomes impossible: cache keys would be vendor-specific.

### B. A shared "raw" type with vendor extension fields

`Portfolio` with `helius?: HeliusExtra`, `triton?: TritonExtra`. Rejected:

- Pollutes the domain model with vendor names.
- Encourages vendor-specific code paths in commands.
- Versions poorly: each new vendor adds a field.

### C. JSON schema everywhere, no domain types

Treat all data as JSON; rely on runtime checks. Rejected: violates strict TypeScript rules (`general.md`), erodes type safety, makes refactors silent.

