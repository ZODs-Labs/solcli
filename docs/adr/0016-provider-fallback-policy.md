# ADR-0016: Provider fallback policy

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0005](./0005-operations-layer.md), [ADR-0006](./0006-capability-manifest.md).

## Context

Vendor RPCs go down, rate-limit, return stale slots or simply lack a
capability the active operation needs. The CLI must not collapse on the
first failure when a fallback exists; equally, it must not pretend a
fallback was the primary when reporting back to the user or to an agent.

ADR-0001 introduced ports and adapters; ADR-0005 introduced an
operations layer between commands and ports. The fallback policy lives
in the operations layer: per-call, with per-port resolution from the
registry. The policy decides which provider to ask first, how to retry,
when to fail over and how to expose the chain that produced the
answer.

## Decision

### Chain shape

The chain for any port resolution is:

1. **Primary**: the active provider for the profile (selected by config
   or `--provider`).
2. **Fallback**: the next provider in the profile's `fallbacks` list
   that implements the port (per ADR-0006's manifest).
3. **Public**: the public RPC endpoint for the network, when the port
   has a public-RPC implementation (`SimulateTransactionPort`,
   `ExecuteTransactionPort`, basic getters). The public chain is the
   last resort.

The chain is computed per port, not per command, because a single
command may resolve through multiple ports with different fallback
shapes.

### Retry budget

Each provider in the chain gets a bounded retry budget per call:

- 3 attempts by default, with exponential backoff and full jitter (per
  `async.md`).
- Retry on 408, 429, 5xx, network errors and timeouts.
- Honor `Retry-After` (numeric seconds or HTTP-date).
- Do not retry on 4xx other than 408 and 429.

When a provider's budget is exhausted, the operations layer logs the
failover and tries the next provider in the chain. The chain is not
re-entered: a provider that already failed in this call is not retried
in this call. The budget resets per call, not per command.

### Failover telemetry

Every failover is observable:

- A structured log at `warn` level naming the failing provider, the
  port, the error code and the next provider in the chain.
- A counter increment per (provider, port, reason) so a `solcli doctor`
  view can summarize recent failovers.
- An events-channel record (ADR-0014) is not emitted for transport-level
  failovers; the events channel is for pipeline stages, not transport
  retries.

### `meta.providerChain[]`

Every JSON, NDJSON and CSV response carries the actual chain that
produced the answer:

```json
{
  "kind": "token.balance",
  "data": { "...": "..." },
  "meta": {
    "network": "mainnet-beta",
    "providerChain": [
      { "name": "helius", "outcome": "rate_limited" },
      { "name": "triton", "outcome": "ok" }
    ],
    "requestId": "r_8f3a2e"
  }
}
```

Agents learn which provider actually served the answer without parsing
logs. The chain is recorded per port resolution and aggregated at the
command boundary; a command that calls three ports records the
resolution outcome for each.

### Refusal cases

The chain is exhausted when:

- Every provider that implements the port has failed.
- No provider in the chain implements the port (per the manifest).

The first case raises `SOLCLI_E_PROVIDER_EXHAUSTED` (exit code 69,
unavailable); the second raises `SOLCLI_E_PROVIDER_UNSUPPORTED` (exit
code 69) and lists the providers that do support the port so the user
or agent can adjust the profile.

## Consequences

### Positive

- Vendor outages do not collapse the CLI when a fallback exists.
- The chain is explicit in the response, so agents do not have to guess
  what answered them.
- The retry budget is bounded; runaway retry storms are impossible.
- Per-port resolution means a command that uses a niche port does not
  fall back to a vendor that does not implement it.

### Negative

- More moving parts than "call the primary and bubble up". Mitigated by
  the operations layer (ADR-0005) which centralizes the logic.
- `meta.providerChain[]` adds bytes to every response. The chain is
  small (typically 1-2 entries) and the value to agents is high.

## Alternatives considered

### A. Round-robin across providers

Distribute load across primary and fallback. Rejected. Hides which
provider answered, makes per-vendor rate-limit accounting impossible
and confuses cost attribution.

### B. Failover only on full outage

Only fall over when the provider returns a hard connect-refused.
Rejected. Rate-limit (429) is the dominant failure mode for paid
providers; failover must include rate-limit responses.

### C. Hide the chain from `meta`

Keep the response shape provider-agnostic. Rejected. Agents and audit
logs must be able to attribute results to a provider; the chain is part
of the answer.
