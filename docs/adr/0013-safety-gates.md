# ADR-0013: Safety gates around the transaction pipeline

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0008](./0008-tx-service-port-and-policy.md), [ADR-0009](./0009-signer-port-and-adapters.md), [ADR-0014](./0014-ndjson-events-channel.md).

## Context

A CLI that signs transactions for humans and agents must default-deny
dangerous outcomes. The threats range from a typo in an amount (sending
1000 SOL instead of 1.000 SOL), to a malicious URL in a swap path (an
unknown program ID with an authority-grab instruction), to an agent
double-submitting on a retry, to a slippage-tolerant swap that the user
agreed to at 1% but routes through a 12% pool.

The exit-code table is frozen (see `cli.md`). New error codes must map
to the existing exit codes; no new exit codes are introduced by this
ADR.

A single "safety gate" cannot answer every question. The decision below
defines six gates that each evaluate a specific risk and emit a typed
verdict. The TransactionService refuses the send when any gate rejects
and emits a `safety.gate.rejected` event (ADR-0014). Each gate has an
override flag with a documented opt-out for agent flows that intentionally
relax the gate, but no gate is silently bypassed.

## Decision

Six gates run, in order, against the intent envelope before the build
stage of the pipeline. Each gate returns `pass`, `warn` or `reject`. A
`reject` short-circuits the pipeline; a `warn` is logged and recorded as
a `safety.gate.passed` event with `severity: "warn"` so agents can choose
to halt.

### 1. simulate-first gate

Enforces ADR-0008's simulate-first default. Reject when the active
provider cannot simulate and `--no-simulate` is not set. Code:
`SOLCLI_E_SAFETY_SIMULATE_REQUIRED`. Exit code: 78 (config error: no
provider can satisfy the policy).

### 2. idempotency-key gate

Every write command computes a deterministic `intentId` from
`(command path, intent fields, profile, recent slot bucket)`. The gate
rejects if a previously observed `intentId` was already submitted and
confirmed within the lookback window (default 60 seconds), unless
`--allow-replay` is set. Code: `SOLCLI_E_SAFETY_IDEMPOTENCY`. Exit code:
65 (data error: the same intent has already been confirmed).

### 3. cost-budget gate

Sums the worst-case cost (transfer amount + priority fee + tip + rent
exemption deltas) and rejects when it exceeds the configured budget. The
budget is a per-profile config value with a `--max-cost` flag override.
Code: `SOLCLI_E_SAFETY_COST_EXCEEDED`. Exit code: 65.

### 4. allowed-program gate

Rejects when the intent's instruction set touches a program ID not in
the profile's allowlist. The default allowlist covers system, token,
associated token account, compute budget, vote, stake, address lookup
table, memo and well-known DEX program IDs. Code:
`SOLCLI_E_SAFETY_PROGRAM_DENIED`. Exit code: 65.

### 5. slippage gate

For swap intents, rejects when the resolved route's worst-case slippage
exceeds the user's declared tolerance. The intent envelope carries
`slippageBps`; the resolver returns `worstCaseBps`; the gate compares.
Code: `SOLCLI_E_SAFETY_SLIPPAGE`. Exit code: 65.

### 6. intent emission

Not a gate per se; the final stage before build. The validated intent
envelope is emitted as an `intent.emitted` event on the NDJSON channel
(ADR-0014). The envelope is the same shape ADR-0009 hands to
`SignTransactionPort`. Hardware signers and remote signers can verify
the envelope they receive matches the emitted one.

### Code-to-exit-code map

The new safety codes all map to existing exit codes:

| Code | Exit |
|---|---|
| `SOLCLI_E_SAFETY_SIMULATE_REQUIRED` | 78 |
| `SOLCLI_E_SAFETY_IDEMPOTENCY` | 65 |
| `SOLCLI_E_SAFETY_COST_EXCEEDED` | 65 |
| `SOLCLI_E_SAFETY_PROGRAM_DENIED` | 65 |
| `SOLCLI_E_SAFETY_SLIPPAGE` | 65 |

No new exit-code value is introduced. The frozen set (64, 65, 69, 70,
73, 75, 77 and 78) is sufficient for every safety verdict.

## Consequences

### Positive

- Default-deny is structural; gates run before signing, not after.
- Each gate is a small, named module with its own tests. New gates land
  by adding a new code and registering with the pipeline.
- The events channel sees both the passes and the rejects, so an agent
  can reason about which gate stopped a flow.
- Hardware and remote signers see the same envelope the gates evaluated,
  closing the loop on trust.

### Negative

- Five gates plus the intent emission step is more orchestration than a
  v0 command would have written inline. Mitigated by sharing the
  framework: each gate is roughly 30 lines of decision logic.
- Cost-budget tuning depends on accurate fee estimates; a stale estimate
  may produce a false positive. Mitigated by re-evaluating after
  simulation if the simulated units exceed the estimate.

## Alternatives considered

### A. One monolithic safety check

A single function that decides accept or reject for any intent.
Rejected. The gates have independent failure modes and per-gate overrides;
collapsing them into one decision loses that granularity and the events
channel's per-gate stream.

### B. Gates as soft warnings only

Every gate emits a warning, the user decides. Rejected. The threat model
(unattended agent runs, irreversible signed transactions) demands
default-deny.

### C. Allowlist programs via an external service

Fetch the allowlist from a registry. Rejected for v1. The list is small,
well-known and stable enough to ship in-tree; a future ADR can introduce
a fetch path with cache and signature verification.
