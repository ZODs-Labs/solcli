# ADR-0006: Capability manifest for runtime port introspection

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0002](./0002-one-port-per-operation.md).

## Context

Operations need to ask the registry: "Which providers implement port X?"
Three ways to answer:

1. **Method-existence sniffing**: `typeof provider.getPortfolio === "function"`. Fragile, lies under proxies, breaks under tree-shaking.
2. **A boolean method**: `provider.supports("getPortfolio")`. Requires instantiation; cannot answer questions about a provider before it is created (e.g. `solcli doctor`).
3. **A manifest value**: each provider has a `manifest.ports: ReadonlySet<PortName>`. Inspectable without instantiation; declarative.

## Decision

Each provider exposes a **manifest** value:

```ts
export interface ProviderManifest {
  readonly name: string;
  readonly version: string;
  readonly ports: ReadonlySet<PortName>;
}

export interface ProviderInstance {
  readonly manifest: ProviderManifest;
  port<P>(name: PortName): P | undefined;
}
```

The manifest is paired with a factory function:

```ts
// packages/providers/src/vendors/helius/index.ts
export const HELIUS_MANIFEST: ProviderManifest = {
  name: "helius",
  version: "1",
  ports: new Set(["getPortfolio", "getPriorityFeeEstimate", "getTransaction"]),
};

export function createHeliusProvider(opts: HeliusOptions): ProviderInstance {
  const client = new HeliusClient(opts);
  const ports = new Map<PortName, unknown>([
    ["getPortfolio", makeHeliusGetPortfolio(client)],
    // ... only the ports the vendor implements
  ]);
  return {
    manifest: HELIUS_MANIFEST,
    port<P>(name) { return ports.get(name) as P | undefined; },
  };
}
```

The registry uses the manifest to answer `capableFor(portName)` without
instantiating any provider it doesn't need to.

## Consequences

### Positive

- **`solcli doctor` can list capabilities** without making any vendor network call. The manifest is a value.
- **Capability metadata can grow** without breaking existing code. The manifest is the natural home for rate limits, regional endpoints, vendor SDK version, expected response shape version.
- **Plugins can declare their manifest before loading their adapter code.** Useful for static analysis and dependency planning.
- **Capability assertions are cheap**: a `Set.has()` lookup.

### Negative

- **The manifest must be kept in sync** with the actual port implementations. Mitigated by a unit test per vendor adapter that asserts `manifest.ports` equals the set of registered ports in the factory's `ports` map.

## Rules

1. **Every vendor adapter exports a `MANIFEST` constant** and a `create<Vendor>Provider` factory.
2. **Manifests are immutable** at runtime. `ReadonlySet` is structurally enforced.
3. **The manifest is the source of truth.** If `manifest.ports` says `getPortfolio`, the factory must register a `GetPortfolioPort` implementation. The unit test enforces this.
4. **Capabilities have one canonical name** per port, defined in `PortName` (a TypeScript union in `@solcli/contracts/providers.ts`). No aliases.

## Alternatives considered

### A. `supports(name): boolean` method on a runtime Provider object

Rejected. Requires instantiation; can't inspect ahead of time; can lie about the implementation (return true and throw at the call site).

### B. TypeScript type predicates only (no runtime value)

`function isPortfolioProvider(p: Provider): p is GetPortfolioPort`. Rejected. Static-only; cannot drive `doctor` or runtime fallback policy.

### C. Plain object listing methods (no Set)

```ts
manifest.ports = { getPortfolio: true, getBalance: true };
```

Rejected. Looser type, redundant boolean per key, more verbose, no improvement over `ReadonlySet`.

