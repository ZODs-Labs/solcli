# ADR-0007: Bundle vendors as folders in @solcli/providers, not separate packages

**Status:** Accepted (2026-05-11). Supersedes earlier choice to keep `provider-helius` and `provider-triton` as separate workspace packages.
**Decider:** ZODs Labs (soleng001).

## Context

First-party Solana vendor adapters (Helius, Triton, future Quicknode etc.)
were initially scaffolded as separate workspace packages
(`packages/provider-helius`, `packages/provider-triton`). The packages
contained one-line export stubs at v0.0.x.

Two patterns exist in the wider TypeScript SDK ecosystem:

- **Bundled** (folders inside one package): Anthropic SDK, Stripe SDK,
  Helius's own SDK, NextAuth OAuth providers, viem chains.
- **Multi-package** (one publishable package per vendor): AWS SDK v3
  service clients, NextAuth database adapters, Pothos plugins.

The deciding criteria (per the SDK pattern survey in
[docs/architecture-providers.md §3.9](../architecture-providers.md) and the
prior `OPENSOURCE_PREREQ.md` research) are:

1. Do consumers pick a subset (separate packages) or do they get everything (bundled)?
2. Do adapters share substantial infrastructure (HTTP, retry, auth, error mapping)?
3. Is there a third-party plugin authoring story?

## Decision

First-party vendor adapters live as folders inside `@solcli/providers`:

```
packages/providers/src/vendors/helius/
packages/providers/src/vendors/triton/
```

Each vendor folder contains the manifest, factory, ACL ports, vendor-only
operations, and a README. Shared infrastructure lives in
`packages/providers/src/_base/`.

## Consequences

### Positive

- **Adding a vendor is one folder.** No workspace entry, no separate `package.json`, no separate `tsconfig.json`, no separate `vitest.config.ts`, no separate `verify:deps` allowlist.
- **Shared `_base/` has a natural home.** HTTP client, retry, auth, error mapping are siblings of all vendors.
- **No cross-package boundary fence** required between vendors. (Replaced by a folder-isolation rule enforced by `verify-boundaries.ts`.)
- **CI builds fewer projects.** `tsc -b` runs through fewer references.
- **Bundle output is identical.** tsup inlines `@solcli/*` regardless of folder vs package shape.

### Negative

- **Cannot publish a single vendor as a standalone package** without splitting. Mitigated: no current need; if v0.2 demands it (see "When to revisit"), splitting one folder back out is mechanical.
- **The providers package grows.** Each vendor adds files. Acceptable for the scale solcli will accumulate (likely 3-6 vendors over 12 months).

## Rules

1. Files under `packages/providers/src/vendors/<vendor>/**` may not import from `packages/providers/src/vendors/<other>/**`. Shared code goes through `_base/`. Enforced by `scripts/verify-boundaries.ts`.
2. Each vendor folder exports a `MANIFEST` constant and a `create<Vendor>Provider` factory (per ADR-0006).
3. Vendor SDK packages (e.g. `helius-sdk`, `@triton-one/...`) may only be imported by files under that vendor's folder. Enforced by lint or by `verify-boundaries.ts` extension.

## When to revisit (criteria for splitting back into separate packages)

Revisit this decision if ANY become true:

1. **Heavy native dependencies asymmetric across vendors.** Example: Triton's gRPC adapter requires `@triton-one/grpc-client` with platform-specific `.so` / `.dylib` files (50+ MB). Helius-only users should not install that. Move Triton to its own package and depend on it conditionally.
2. **External plugin authoring becomes a real need.** Third parties want to publish `@quicknode/solcli-provider` and have it auto-discovered. The contract is already stable (`@solcli/contracts`); enabling this is a config-loader change in the app, not a packaging change of the existing vendors.
3. **Two vendors have a license incompatibility** (e.g. one ships under a copyleft license). Split.
4. **Divergent release cadence** that meaningfully hurts users (a vendor fix ships in 24 hours but the rest of the CLI rolls weekly).

## Alternatives considered

### A. Keep one package per vendor (the prior state)

Rejected. At v0.0.x and v0.1, every benefit listed above evaporates because each vendor package contains a single stub file. The cost of the split (workspace entries, tsconfig references, verify-deps allowlist, custom cross-package import rules) is borne with no payoff.

### B. One package per *protocol family* (HTTPS vendors in one, gRPC vendors in another)

Rejected. The split would force a boundary that doesn't map to any vendor's reality (Triton offers HTTPS AND gRPC). The folder-with-`_base/` shape handles this naturally.

### C. Adapters as separate packages plus a `@solcli/providers-core` package

Rejected. Same cost as A with an extra package for the shared infrastructure. Adopt this shape only if criterion (1) under "When to revisit" triggers and the split happens for cause.

## Migration history

- 2026-05-11: `packages/provider-helius/` and `packages/provider-triton/` deleted; contents moved to `packages/providers/src/vendors/helius/` and `packages/providers/src/vendors/triton/`. Verified by `pnpm verify:architecture`, `pnpm verify:deps`, full test suite and CLI smoke.

