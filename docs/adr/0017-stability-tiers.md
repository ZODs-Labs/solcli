# ADR-0017: Stability tiers per command

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0010](./0010-capability-manifest-format.md), [ADR-0015](./0015-anchor-idl-tier-0-protocol-adds.md).

## Context

solcli's surface grows along three axes: core commands the team owns,
synthesized commands from Anchor IDLs (ADR-0015) and plugin
contributions (ADR-0012). Each axis adds commands at different audit
posture. Treating every command as "stable until removed" misleads users
and agents about what may break under them. A tier model gives the
manifest a single field that tells consumers what to expect.

The tiers are not new. The shape draws from Rust's stable/beta/nightly,
from Kubernetes' alpha/beta/GA and from npm's experimental/stable
conventions. The point is the contract each tier makes about backwards
compatibility, not the names.

## Decision

Three tiers exist:

| Tier | Backwards-compat promise | Default visibility |
|---|---|---|
| `alpha` | none; the surface may change in any minor release | hidden in `--help`; excluded from manifest unless `--include alpha` |
| `beta` | breaking changes require a deprecation window in one minor release before the next | visible in `--help`; included in manifest |
| `stable` | breaking changes require a major version bump per semver | visible in `--help`; included in manifest |

### Carriage

Each command's `stability` lives in:

- The command file's `meta.stability` field (Citty meta extension).
- The build-time manifest (ADR-0010) at `commands[].stability`.
- The `--help` output for that command, as the first line of the body:
  `(alpha)`, `(beta)` or nothing for stable.

### Manifest filter

The runtime manifest (and `solcli manifest`, `solcli mcp serve`'s
tool-list response, every consumer of the manifest) filters by
stability:

- Default: `beta` and `stable` are included; `alpha` is excluded.
- `--include alpha` opts in to alpha.
- `--include all` includes every tier (alpha, beta and stable).
- `--exclude beta` excludes beta (rare; useful for "show me only the
  audited surface").

The filter is applied at manifest assembly time. An agent that asks for
the tool catalogue gets a filtered view that matches what the human
sees.

### Breaking-change rules

- A command tagged `alpha` may change its arguments, output shape and
  command path in any minor release. Removal does not require a
  deprecation entry.
- A command tagged `beta` may have breaking changes only after at least
  one minor release ago shipped a `deprecation` field in its manifest
  record and a `Deprecation` warning on stderr.
- A command tagged `stable` may have breaking changes only across a
  major version bump. Removals require a `deprecation` field for at
  least one major version before the major in which they are removed.

The breaking-change rules apply identically to a command's argument
schema, its output shape and its observable side effects (which
provider ports it consumes, which events it emits).

### Promotion criteria

A command is promoted from `alpha` to `beta` when:

- It has shipped for at least one minor release at `alpha`.
- It has a test that pins its argument schema, its output schema and
  every event kind it emits.
- It has documented error codes for every failure path the command can
  produce.
- It has an entry in `docs/cli/`.

A command is promoted from `beta` to `stable` when:

- It has shipped for at least one minor release at `beta`.
- The cross-platform e2e suite covers macOS, Linux and Windows for the
  command's primary code path.
- The JSON output shape has had no breaking change for the prior minor
  release.
- A protocol-specific test suite covers the failure modes for write
  commands (insufficient funds, blockhash expiry, simulation failure).

Promotion is a deliberate manifest edit, not an automatic event. A
demotion (stable to beta, beta to alpha) is allowed as a one-way safety
valve; it requires a changelog entry and is treated by consumers as a
break.

## Consequences

### Positive

- Agents and humans have a single field that summarizes what to expect
  about a command's stability.
- The default-filter rule keeps alpha noise out of `--help` and the MCP
  tool catalogue while leaving a clean opt-in for power users.
- The promotion criteria make "stable" earned, not declared.

### Negative

- The team must audit the manifest before each release to confirm
  every command's tag is honest. Mitigated by a `pnpm verify:stability`
  script that flags commands whose code or output changed without a
  matching tag change.
- A demotion is observably a break to consumers; the safety valve is
  honest but uncomfortable.

## Alternatives considered

### A. Two tiers (experimental, stable)

Rejected. The IDL synthesizer (ADR-0015) needs a tag that means
"automatic, generic UX, no semantic claims", which `experimental` can
fit; but the team also needs a tier in which a curated command is in
test under a real promise (one minor of deprecation). Two tiers collapse
those two states.

### B. No tiers; everything is "stable until removed"

Rejected. The synthesized surface from ADR-0015 alone refutes this; the
team cannot stand behind any specific Anchor program's UX.

### C. Per-flag stability tags

Tag individual flags rather than commands. Rejected. The cognitive load
on users and agents is too high for the value; flags inherit their
command's tag.
