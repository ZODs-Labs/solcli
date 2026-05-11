# ADR-0002: One port per operation (not a god-interface)

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0006](./0006-capability-manifest.md).

## Context

ADR-0001 commits to a hexagonal style. The remaining question is the **granularity** of the port interfaces. Two reasonable shapes:

- **Few, large interfaces** grouping related operations (`AccountQueriesPort` with `getBalance` and `getTokenBalances`; `TransactionPort` with `getTransaction` and `getTransactionHistory`).
- **Many, small interfaces**, one per operation (`GetBalancePort`, `GetPortfolioPort`, etc.).

## Decision

**One port per operation.** Each port is a TypeScript interface with a single method, named for the operation. Domain-typed inputs and outputs. Mandatory `AbortSignal` in options.

```ts
export interface GetPortfolioPort {
  getPortfolio(
    owner: Pubkey,
    opts?: { signal?: AbortSignal },
  ): Promise<Portfolio>;
}
```

## Consequences

### Positive

- **Honest capability declaration.** A vendor that supports `getBalance` but not `getTokenBalances` implements only `GetBalancePort`. The TypeScript type system enforces it; no optional-methods gymnastics.
- **Minimum-coupling open-closed.** Adding a new operation does not modify any existing port. No editing a shared interface for unrelated work.
- **Easy testing.** Each port has one method; mocks are trivial; vendor ACL tests target the single mapping.
- **Composable fallback.** The registry's `capableFor(portName)` returns providers implementing exactly that port. The operation picks per call.
- **Future-friendly for plugins.** Third-party adapters depend on the port files they need; they do not need to know about ports they don't implement.

### Negative

- **More files.** ~10-30 port files in `packages/contracts/src/ports/`. Acceptable for the scale of operations solcli will accumulate.
- **Verbose adapter wiring.** A Helius adapter that supports six ports has six `make<Op>Port` factories. Mitigated by a small helper that builds the port map from a declarative list.

## Alternatives considered

### A. Grouped interfaces (e.g. AccountQueriesPort)

Rejected. The grouping is a guess about which operations belong together. Real vendors don't group consistently:

- Helius exposes a portfolio aggregate (`getPortfolio`) and a primitive (`getTokenAccounts`). One vendor, both granularities.
- Triton may expose only the primitive.
- Helius webhooks have nothing to do with account queries but live on the same auth surface.

A grouped interface forces the grouping decision once and locks it in. A per-operation port lets the vendor adapter pick the right level of abstraction per operation.

### B. Method-keyed lookup on a single Provider object

```ts
const balance = await provider.invoke("getBalance", [owner]);
```

Rejected. Loses static typing at the call site; argument and return shapes silently drift; refactors don't catch breakages.

### C. Class-based polymorphism (abstract base class)

```ts
abstract class BaseProvider {
  abstract getBalance(...): Promise<Lamports>;
}
```

Rejected. Same problem as the god-interface: every concrete class implements (or stubs) every method. Single inheritance also prevents a class from mixing-and-matching ports.

## Migration

The legacy `DataProvider` interface in `packages/contracts/src/providers.ts` is marked `@deprecated` and stays for v0.0.x. No new code may use it. At v0.2 it is deleted.

