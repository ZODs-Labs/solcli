# ADR-0001: Hexagonal Architecture (ports and adapters) for the provider layer

**Status:** Accepted (2026-05-11). v0.0.x is migration; v0.1 mandatory.
**Decider:** ZODs Labs (soleng001).

## Context

solcli interacts with the Solana network through multiple third-party
vendors (Helius, Triton; future Quicknode, Jito, Hellomoon, Shyft) plus the
public RPC. The vendors:

- Overlap on commodity RPC methods (getBalance, getSignaturesForAddress).
- Diverge on enhanced endpoints (Helius DAS, Triton gRPC streams, vendor-specific portfolio aggregations).
- Have asymmetric capabilities: any new vendor will implement only a subset of what the others do.

The v0 scaffolding put a single `DataProvider` interface in
`@solcli/contracts` with ~12 optional methods. Adapters were expected to
implement-or-stub each method and maintain a parallel `capabilities` string
set. This shape will not survive v0.1.

## Decision

The provider layer adopts **Hexagonal Architecture**:

- The application (CLI commands and operations) talks to **ports**, small
  domain-typed interfaces, one per operation.
- Vendor adapters implement only the ports they truly support.
- Vendor SDK types are bounded inside the vendor folder by an
  **Anti-Corruption Layer** at the port boundary.
- A provider **manifest** declares which ports each adapter implements,
  enabling runtime introspection without method-existence sniffing.
- The registry exposes both `active()` and `capableFor(port)` so operations
  can apply fallback policy per call.

The application core is independent of any specific vendor's API shape.
Vendor-specific concerns are isolated to the vendor folder and to the
explicit vendor command subtree (see ADR-0004).

## Consequences

### Positive

- Adding a new operation is a one-file change in `packages/contracts/src/ports/`. (Open-Closed.)
- A new vendor adds one folder plus one factory call in `context.ts`. Zero edits to commands.
- Vendor SDK types cannot leak; an ACL test asserts the boundary.
- Capabilities are declarative (`manifest.ports`), not method-existence-by-runtime-check.
- Type safety is end-to-end: ports declare domain inputs/outputs, no `Promise<unknown>`.
- The CLI is testable without any vendor network: ports are interfaces.

### Negative

- More files. Each operation = 1 port file + N ACL files. For solcli's scale (10-30 operations, 3-5 vendors) this is acceptable.
- Migration effort to retire the existing god-interface. Scheduled (see ADR-0002 migration section).
- Discoverability: developers must learn where ports live. Mitigated by canonical file layout in `docs/architecture-providers.md`.

## Alternatives considered

### A. Keep the god-interface

Single `DataProvider` with all methods. Rejected:

- Open-Closed violation: every new operation modifies a shared contract.
- Forces optional methods or stubs; capability set must be maintained in
  parallel and can disagree with method existence.
- `Promise<unknown>` everywhere because no shape is shared across all
  vendors. Type safety silently absent.
- `FallbackChain` becomes a switch-per-method that grows with the interface.

### B. Strategy pattern with a runtime registry of named strategies

Each operation is a strategy function looked up by string. Rejected:

- Loses static type checking at the call site.
- Strings get out of sync with implementations silently.
- The hexagonal pattern subsumes this with manifest-based ports while keeping types.

### C. GraphQL gateway over vendors

Federate vendor APIs through a GraphQL gateway. Rejected:

- Massive complexity for a CLI; introduces a runtime that doesn't exist today.
- Doesn't solve the "vendor X has an operation Y has not" problem any
  better than capability manifests do.
- Adds latency to a workflow whose only constraint is keeping the binary
  small and the network fast.

