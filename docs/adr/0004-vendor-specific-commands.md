# ADR-0004: Vendor-specific commands as an explicit escape hatch

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0003](./0003-anti-corruption-layer-per-vendor.md).

## Context

Some vendor features have no faithful cross-vendor abstraction:

- **Helius webhooks** (subscribe to on-chain events with custom triggers): no equivalent on Triton or public RPC.
- **Helius enhanced transactions** (proprietary parser with semantic tagging): the schema is Helius-specific.
- **Triton gRPC streams** (Yellowstone-like firehose): no equivalent on Helius's HTTPS API.
- Vendor-specific support commands (token program registration, support tickets, dashboards).

Pretending these are universal operations is dishonest. Hiding them entirely
removes most of the reason a user chose Helius or Triton in the first place.

## Decision

solcli exposes vendor-specific operations through a **command subtree named
after the vendor**:

```
solcli helius webhooks create --filter ...
solcli helius webhooks list
solcli triton streams tail --filter ...
```

Rules for vendor command subtrees:

1. The vendor name must appear in the command path. Lock-in is **visible** to the user at the shell prompt.
2. Vendor command implementations may import the vendor adapter directly (`@solcli/providers` re-exports `createHeliusProvider`). This is the only place outside the providers package that has this privilege.
3. Vendor command `meta.description` must mention the vendor explicitly.
4. Vendor commands fail with `SOLCLI_E_CONFIG` if the vendor is not configured (e.g. `helius.apiKey` secret missing). No silent skipping.
5. Vendor commands cannot also be reachable through the domain command tree (no `solcli portfolio --vendor-mode helius-extra` aliases). The escape hatch is **exactly one path**.

## Consequences

### Positive

- **Lock-in is named, not hidden.** Users typing `solcli helius webhooks` understand they cannot port that workflow to another vendor.
- **Domain commands stay clean.** `solcli portfolio` is vendor-agnostic; users can switch the active provider in config and the command keeps working.
- **Vendor-specific schema lives in the vendor folder.** No leakage into the domain.
- **Power users get the vendor's specialty endpoints.** No artificial floor at the lowest-common-denominator API.

### Negative

- **Two surfaces.** Domain commands and vendor commands need separate help text and discoverability. Mitigated by `solcli --help` listing both groups and by `solcli <vendor> --help` listing what's available.
- **Some operations might exist in both surfaces over time.** When that happens, the domain version takes precedence and the vendor-specific version is deprecated. Process: write an ADR for the promotion.

## Anti-rules

- **Vendor commands do NOT use the operation layer.** They talk to the vendor adapter directly. Operations exist for polymorphic operations; vendor commands are explicitly non-polymorphic.
- **Vendor commands do NOT have a fallback chain.** If you typed `solcli helius webhooks` and Helius is down, the command fails. Falling back to Triton webhooks would be nonsense.

## Alternatives considered

### A. Hide vendor-specific operations entirely

Only expose the cross-vendor intersection. Rejected:

- Defeats most of the value of choosing Helius or Triton.
- Forces solcli to invent fake abstractions over operations that don't generalize.

### B. Expose vendor-specific operations through flags on domain commands

`solcli portfolio --use-helius-grouping`. Rejected:

- Pollutes domain commands with vendor concepts.
- Makes the domain layer impossible to test without each vendor's full configuration matrix.
- Lock-in becomes invisible (a flag deep in a help page).

### C. Expose vendor operations as separate top-level commands without a vendor namespace

`solcli webhooks` (assumes Helius). Rejected:

- Misleading: a user with Triton configured types `solcli webhooks` and gets a "not supported" error.
- No room for cross-vendor implementations later.

