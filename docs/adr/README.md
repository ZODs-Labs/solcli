# Architecture Decision Records

Each ADR documents one load-bearing architectural decision. ADRs are
immutable once accepted; new decisions get new ADR numbers and can mark
older ADRs as `Superseded`.

Format follows the standard ADR template ([Michael Nygard, 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)):
Context, Decision, Consequences, Alternatives, References.

## Index

| # | Status | Title |
|---|--------|-------|
| [0001](./0001-hexagonal-provider-architecture.md) | Accepted | Hexagonal Architecture (ports and adapters) for the provider layer |
| [0002](./0002-one-port-per-operation.md) | Accepted | One port per operation, not a god-interface |
| [0003](./0003-anti-corruption-layer-per-vendor.md) | Accepted | Anti-Corruption Layer per vendor adapter |
| [0004](./0004-vendor-specific-commands.md) | Accepted | Vendor-specific commands as an explicit escape hatch |
| [0005](./0005-operations-layer.md) | Accepted | Operations layer between commands and ports |
| [0006](./0006-capability-manifest.md) | Accepted | Capability manifest for runtime port introspection |
| [0007](./0007-vendor-folders-not-packages.md) | Accepted | Bundle vendors as folders, not separate packages |
| [0008](./0008-tx-service-port-and-policy.md) | Accepted | TransactionService port and simulate-first policy |
| [0009](./0009-signer-port-and-adapters.md) | Accepted | Signer port and adapter shapes |
| [0010](./0010-capability-manifest-format.md) | Accepted | Capability manifest format and runtime overlay |
| [0011](./0011-mcp-bridge-inside-binary.md) | Accepted | MCP bridge inside the binary |
| [0012](./0012-three-tier-extension-model.md) | Accepted | Three-tier extension model for plugins |
| [0013](./0013-safety-gates.md) | Accepted | Safety gates around the transaction pipeline |
| [0014](./0014-ndjson-events-channel.md) | Accepted | NDJSON events channel |
| [0015](./0015-anchor-idl-tier-0-protocol-adds.md) | Accepted | Anchor IDL tier-0 protocol synthesis |
| [0016](./0016-provider-fallback-policy.md) | Accepted | Provider fallback policy |
| [0017](./0017-stability-tiers.md) | Accepted | Stability tiers per command |
| [0018](./0018-agent-mode-fd-3-stream.md) | Accepted | Agent mode and the fd 3 stream |
| [0019](./0019-sidecar-mcp-daemon-optional.md) | Accepted | Optional sidecar MCP daemon |
| [0020](./0020-plugin-permission-manifest-schema.md) | Accepted | Plugin permission manifest schema |

## When to write an ADR

Write one when:

- The decision is **load-bearing**: many later decisions depend on this one.
- The decision is **a one-way door**: rolling it back is expensive.
- The decision **resolved a tradeoff** that future contributors will question.
- The decision **rejects an obvious alternative**: capture why.

Do NOT write one for:

- A library choice that is easily swapped (e.g. picking a specific Zod helper).
- A naming convention that is documented in the style guide.
- A bug fix.

## Lifecycle

ADRs go through:

- **Proposed**: opened as a PR; open to discussion.
- **Accepted**: merged; binding for new code.
- **Superseded by ADR-NNNN**: the decision was revisited and replaced. The old ADR stays, marked as superseded; the new ADR links back.
- **Deprecated**: no longer applicable, no replacement (e.g. a feature was removed).
