# ADR-0008: TransactionService port and simulate-first policy

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0002](./0002-one-port-per-operation.md), [ADR-0013](./0013-safety-gates.md), [ADR-0016](./0016-provider-fallback-policy.md).

## Context

Every write path in solcli (transfer, swap, stake, custom IDL-driven call,
plugin-driven call) flows through the same six-stage pipeline:

1. Build the transaction.
2. Simulate it against a recent slot.
3. Estimate the priority fee.
4. Sign it (or collect partial signatures).
5. Send it to the network or hand it to a bundle endpoint.
6. Confirm it landed at the requested commitment level.

The v0 scaffolding had each command implement parts of this pipeline ad hoc.
That shape will not survive contact with Anchor IDL synthesis, plugin
commands, MCP-tool invocation, agent mode and Jito bundles. The pipeline
must be a single domain service that depends on ports, not on a specific
vendor SDK. The policy (simulate first, refuse the send if simulation
fails, honor the user's fee policy) must be the same regardless of who
called the service.

Helius and Triton both publish priority-fee estimators with different
response shapes. Jito offers a bundle endpoint that takes a tip and skips
the public mempool. The simulate endpoint is available on the public RPC,
on Helius and on Triton, with different request shapes and feature flags.
The service must treat these as ports, not as vendor branches.

## Decision

A `TransactionService` lives in `packages/transaction/src/` and orchestrates
the pipeline. It depends on four ports defined in
`packages/contracts/src/ports/`:

- `ExecuteTransactionPort`: send a fully signed transaction; returns the
  signature once the network has accepted it.
- `SimulateTransactionPort`: simulate a built transaction against a recent
  slot; returns logs, return data, units consumed and any error.
- `GetPriorityFeePolicyPort`: produce a priority-fee recommendation (in
  micro-lamports per compute unit) given the writable accounts touched by
  the transaction.
- `SubmitBundlePort`: optional; submit one or more signed transactions to a
  bundle endpoint with a tip transfer; returns the bundle id and the per-
  transaction signatures.

The service exposes one method:

```ts
service.execute(intent, opts): Promise<TransactionReceipt>
```

The intent envelope carries the instructions, the writable account set, the
commitment level, the fee policy choice and an optional bundle hint (see
ADR-0013 for the intent shape and ADR-0014 for the events emitted at each
stage).

### Simulate-first policy

- Default: simulate the transaction before signing. A simulation error
  short-circuits the pipeline and surfaces the program logs through
  `SOLCLI_E_TX_SIMULATION_FAILED`.
- Opt out: `--no-simulate` skips the simulate stage. The command still
  records `tx.simulate` as `skipped` on the events channel (ADR-0014) so
  agents can detect uninspected sends.
- Simulation runs against the active provider's `SimulateTransactionPort`.
  If the active provider does not implement it, the registry falls back
  per ADR-0016. If no provider in the chain implements simulation, the
  service refuses the send unless `--no-simulate` is set explicitly.

### Fee policy choice

The fee policy is one of:

- `none`: omit the compute-unit-price instruction.
- `recent`: use the public RPC's `getRecentPrioritizationFees`.
- `helius`: ask the Helius priority-fee estimator.
- `triton`: ask the Triton priority-fee estimator.
- `jito`: combine a small compute-unit-price with a Jito tip on the bundle
  path; see below.

The choice is resolved by the operations layer (see ADR-0005) and resolves
through `GetPriorityFeePolicyPort`. The estimator returns a recommendation;
the service writes the corresponding compute-budget instructions before
sign.

### Bundle path

When the intent carries `bundle: { tipLamports, endpoint }`, the service
routes through `SubmitBundlePort` instead of `ExecuteTransactionPort`.
The bundle path:

- Adds the Jito tip transfer as the final instruction in the last
  transaction of the bundle.
- Signs every transaction.
- Submits the bundle through `SubmitBundlePort`.
- Confirms each signature with the same confirmation logic as the
  single-transaction path.

If `SubmitBundlePort` is requested but unavailable in the provider chain,
the service throws `SOLCLI_E_PROVIDER_UNSUPPORTED` (exit code 69) and
lists providers that do support it.

## Consequences

### Positive

- The pipeline is one code path. Anchor synthesizer, plugins and MCP tools
  all hit the same simulate-first policy.
- Vendor lock-in is bounded to the adapter; the service knows nothing
  about Helius or Jito response shapes.
- Jito bundles are not a special case at the command layer; commands set
  `bundle` on the intent and the service does the right thing.
- The events channel (ADR-0014) gets a stable stream of pipeline kinds
  (`tx.build`, `tx.simulate`, `tx.fee.estimated`, `tx.signed`, `tx.sent`,
  `tx.confirmed`, `tx.failed`) for free.

### Negative

- Four new ports plus a service is more surface than the v0 inline calls.
  Mitigated by the existing port-per-operation rule (ADR-0002): each port
  is a few lines.
- The bundle path requires careful blockhash discipline (every transaction
  in the bundle must share the same recent blockhash). The service
  centralizes this so commands cannot get it wrong.

## Alternatives considered

### A. Per-command transaction helpers

Each command (transfer, swap, stake) constructs and sends its own
transactions. Rejected. Duplicated simulate logic, inconsistent fee
policy, no single home for the events channel and a real chance that one
command silently drops simulation.

### B. A monolithic `TransactionPort`

One port covering build, simulate, fee, send, confirm. Rejected. Violates
ADR-0002 (one port per operation). Forces every vendor to implement all
stages or stub them. The Jito case in particular has only a bundle
endpoint and no simulate.

### C. Always-on simulation with no opt-out

Reject sends that fail simulation, no flag to bypass. Rejected. Power
users and CI flows occasionally need to send transactions that simulation
cannot evaluate (e.g. instructions whose state changes are not yet
observable). The `--no-simulate` opt-out is logged as a warning and
recorded as `simulate: skipped` so agents and audit tooling can see it.
