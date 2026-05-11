# ADR-0019: Optional sidecar MCP daemon

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0011](./0011-mcp-bridge-inside-binary.md).

## Context

ADR-0011 puts the MCP server inside the solcli binary because v1 favors
single-binary distribution and a shared composition root. Three classes
of workload do not fit that shape cleanly:

- **Hosted agent runs**: an agent platform hosts multiple agents that
  each want a long-lived MCP session. Spawning one solcli process per
  agent burns RAM and process slots.
- **HTTP+SSE clients**: web-based agent UIs that prefer an HTTP
  transport, not stdio.
- **Multi-tenant deployments**: a shared session that brokers calls from
  many clients to a single set of provider credentials, with rate-limit
  pooling and audit.

A sidecar daemon is the right shape for those workloads. v1 defers it,
but the decision to defer is itself load-bearing because it sets the
back-out path for the inside-the-binary bridge.

## Decision

A sidecar MCP daemon is **deferred** for v1. The decision documents:

- The shape the daemon will take when it lands.
- The back-out path from the inside-the-binary bridge to the sidecar.
- The properties an implementation must satisfy.

### Shape (deferred)

The sidecar will be a separate Node binary, `solcli-mcpd`, that:

- Runs as a long-lived process owned by the user (no system service).
- Listens on a configurable transport (stdio, Unix domain socket, HTTP).
- Reuses the solcli composition root by importing the same
  `@solcli/*` packages; the daemon is a thin transport over the same
  command runner.
- Reads the same `solcli.config.toml`, the same plugin set (ADR-0012)
  and the same provider credentials.
- Exposes the same runtime manifest (ADR-0010) and the same events
  channel (ADR-0014).

### Back-out path

The inside-the-binary bridge (ADR-0011) is the canonical v1 surface. If
operational pressure forces an earlier sidecar:

- The sidecar consumes solcli as a library through the existing
  composition root; no command's behavior changes.
- `solcli mcp serve` continues to ship and remains the recommended
  default for single-agent workflows.
- The events channel, the safety gates and the manifest are unchanged.

The back-out is purely additive: the sidecar adds a transport, not a
new policy.

### Acceptance criteria when the daemon lands

A future ADR (anticipated number reserved) will accept the daemon when:

- A hosted agent platform has a documented use case that stdio cannot
  serve.
- The daemon's authorization model is reviewed (the same plugin trust
  tiers from ADR-0012 must extend to the daemon's clients).
- Single-binary install (`npm i -g solcli`) continues to work without
  the daemon for users who do not need it.

## Consequences

### Positive

- v1 stays single-binary while preserving an explicit migration path.
- Operational decisions about long-lived processes are made when there
  is a real workload, not speculatively.
- The composition-root rule (one runner, one manifest, one policy set)
  is preserved across the sidecar transition.

### Negative

- Hosted agent runs that want one daemon per host wait for v2 (or
  invoke the inside-the-binary bridge per agent in the meantime).
- Two MCP entry points exist when the daemon lands. The team must
  ensure they cannot drift; mitigated by the shared composition root.

## Alternatives considered

### A. Ship the sidecar in v1 instead of the inside-the-binary bridge

Rejected. Doubles the distribution surface and the operational story
for v1 users who only need a single agent session.

### B. Ship both in v1

Rejected. Two MCP entry points before either has shipped to users is
premature. Single binary first; sidecar when a real workload asks for
it.

### C. Treat the sidecar as out of scope forever

Rejected. The hosted-agent use case is real and growing; documenting
the back-out path now keeps ADR-0011 honest about its scope.
