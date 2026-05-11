# ADR-0014: NDJSON events channel

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0008](./0008-tx-service-port-and-policy.md), [ADR-0013](./0013-safety-gates.md), [ADR-0018](./0018-agent-mode-fd-3-stream.md).

## Context

Agents and CI pipelines need structured per-stage progress: when a
transaction was simulated, what the fee estimate was, when it was
signed, when it landed. Re-deriving the timeline from logs is unreliable
(log message phrasing changes; the redactor may rewrite a field; the log
level may suppress a line). A stable event stream with a typed schema is
the right answer.

The events channel is distinct from the structured logger (which carries
human-targeted operator narrative) and from stdout (which carries the
command's final result data). It is a third channel with its own
contract and its own sink-selection rules. The selection is driven by
the command's flags and by the agent-mode env var (ADR-0018).

## Decision

A new channel emits NDJSON event records, one object per line, terminated
with `\n`. The records share a discriminator (`kind`) and a small
envelope so agents can dispatch on `kind` without inferring shape.

### Record shape

```json
{
  "kind": "tx.simulate",
  "ts": "2026-05-11T12:34:56.789Z",
  "intentId": "intent_8f3a2e",
  "requestId": "r_8f3a2e",
  "command": ["token", "transfer"],
  "network": "mainnet-beta",
  "provider": "helius",
  "data": { "...": "..." }
}
```

`kind` is one of:

- `tx.build`
- `tx.simulate`
- `tx.fee.estimated`
- `tx.signed`
- `tx.sent`
- `tx.confirmed`
- `tx.failed`
- `safety.gate.passed`
- `safety.gate.rejected`
- `intent.emitted`
- `plugin.loaded`
- `plugin.refused`
- `idl.synthesized`

Adding a `kind` is backwards-compatible. Renaming or removing a `kind`
is a breaking change and requires a CLI major-version bump.

### Sink selection

The sink is chosen at command runner startup:

| Condition | Sink |
|---|---|
| `--events ndjson` is set | stdout |
| `SOLCLI_AGENT_MODE=1` or `--agent-mode` is set | fd 3 (ADR-0018) |
| `--events <path>` is set to a file path | the file (atomic-rename pattern) |
| otherwise | discard (`/dev/null`) |

When the sink is stdout, the command's output mode is forced to `none`
or `human` and the event records are the stdout payload; mixing tx
events with a JSON command result on stdout is rejected at flag-parse
time.

### Redaction at the emit boundary

Every record passes through the redactor (see `security.md`) before it
hits the sink. The redactor:

- Strips known secret-bearing fields from `data` per the allowlist.
- Replaces any base58 ≥ 32 char string outside the allowlist with
  `<redacted-base58>`.
- Truncates oversized fields (logs, return data) to a documented cap and
  records the truncation in `data.meta.truncated`.

There is no opt-out for the redactor. An event whose redacted shape
loses information valuable to debugging is a bug to fix in the redactor
allowlist, not a bug to fix by disabling redaction.

### Advisory semantics

If the configured sink is unavailable (fd 3 closed in non-agent context;
file path not creatable; pipe broken):

- The event is dropped silently for the consumer.
- A debug-level log line is emitted with code
  `SOLCLI_E_EVENT_SINK_UNAVAILABLE`.
- The command continues. Event emission MUST NOT fail a write the user
  asked for.

The advisory choice is deliberate: events are observability, not policy.
Policy decisions (gates, simulation refusal) live in ADR-0013 and never
depend on the events channel.

## Consequences

### Positive

- Agents get a stable per-stage progress stream with a typed schema.
- Operators reading logs and agents reading events see consistent
  pictures because both pass through the same redactor.
- File-sink mode gives CI runners an audit log of every safety verdict
  and every transaction the runner submitted.
- The advisory semantics keep the events channel from being a single
  point of failure for the pipeline.

### Negative

- Three output channels (stdout, stderr, events) is more discipline than
  two; the rules around sink selection must be tight. Mitigated by
  flag-parse-time validation and a single test per channel-conflict
  combination.

## Alternatives considered

### A. Stream events on stderr alongside logs

Rejected. Mixes a typed stream with free-form log lines; downstream
consumers cannot parse stderr reliably and the log redactor formatting
is different from the events one.

### B. Per-command stream shape

Each command defines its own per-stage shape. Rejected. Loses the value
of a typed `kind`-dispatch stream and forces agents to learn a
per-command vocabulary.

### C. Fail loudly on sink unavailable

If the configured sink fails, abort the command. Rejected. Events are
observability; a closed fd 3 in agent mode should not prevent a
successful transaction from landing.
