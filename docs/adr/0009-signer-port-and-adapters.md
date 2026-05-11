# ADR-0009: Signer port and adapter shapes

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0008](./0008-tx-service-port-and-policy.md), [ADR-0013](./0013-safety-gates.md).

## Context

solcli must sign transactions on behalf of users without ever putting the
secret on argv (see `security.md`). Signers vary widely in capability:

- A keypair file on disk is a synchronous in-process signer.
- A keypair in the OS keychain requires an unlock prompt the first time.
- A Ledger device speaks a different transport, has a screen for user
  confirmation and may be physically absent at sign time.
- A Squads multisig signer produces a proposal, not a final signature.
- A remote signer (HSM, custody API) speaks HTTP and may demand an
  approval workflow with a human in the loop.

A signer-as-callback shape would force every command to know how to handle
asynchronous approvals and unlock prompts. A signer-as-port shape gives
the TransactionService one interface, with the back-end deciding what an
"approve" means in context.

The intent envelope (the validated description of what the user wants to
do) must travel with the signing request. Hardware wallets and policy
signers need to display or evaluate the intent; an opaque byte buffer is
not enough.

## Decision

Two ports live in `packages/contracts/src/ports/`:

- `SignTransactionPort`: take an intent envelope and a built transaction
  (or set of partially-signed transactions for a bundle); return the same
  set with this signer's signature attached. The signer may throw
  `SOLCLI_E_SIGNER_REFUSED` when a hardware screen rejects, or
  `SOLCLI_E_SIGNER_NOT_AVAILABLE` when the signer cannot serve the
  request.
- `SignerInfoPort`: return the public key (and any human-friendly label)
  this signer would use for a given derivation path or alias, without
  performing a sign. Used by `solcli wallet show` and the safety gates.

Six adapter shapes are defined. Each adapter implements both ports.

| Adapter | Source | v1 status |
|---|---|---|
| file | a keypair file on disk (mode `0o600`) | real |
| env | a keypair encoded in a `SOLCLI_*` env var | real |
| keychain | the OS keychain (Keychain, Credential Manager, secret service) | real |
| ledger | a USB Ledger device speaking the Solana app | stub (throws `SOLCLI_E_SIGNER_NOT_AVAILABLE`) |
| squads | a Squads multisig program; emits a proposal | stub (throws `SOLCLI_E_SIGNER_NOT_AVAILABLE`) |
| remote | an HTTP signer endpoint with a documented contract | stub (throws `SOLCLI_E_SIGNER_NOT_AVAILABLE`) |

The three v1-real adapters live in `packages/signers/src/{file,env,keychain}.ts`.
The three stubs live alongside them and exist to validate the port shape
and the CLI's selection logic. The stubs return a stable error code so
agents and tests can detect them without string matching.

### Intent envelope at sign time

Every call to `SignTransactionPort.sign(...)` receives the full intent
envelope alongside the built transaction. The envelope carries:

- The command path and version.
- The semantic operation kind (transfer, swap, stake, custom).
- The writable account set with their roles (payer, source, destination,
  authority, program).
- The denominated amounts (lamports or token amounts, branded per
  `domain-types.md`).
- The user-visible cost preview produced by the cost-budget gate (see
  ADR-0013).
- A stable `intentId` (the idempotency key) referenced by the events
  channel.

Hardware and remote signers MAY render or evaluate the envelope; file and
env signers ignore it. The shape is the same for every signer so commands
do not branch on signer kind.

### Selection

The active signer is selected by precedence per `cli.md`:

1. `--signer <alias>` flag.
2. The `SOLCLI_DEFAULT_SIGNER` env var.
3. The profile's `signer` block in `solcli.config.toml`.
4. The implicit default: a single file signer at the platform paths' data
   directory if exactly one is present.

The selected signer is loaded lazily; nothing is read from disk or unlocked
from the keychain until a write command actually needs to sign.

## Consequences

### Positive

- The TransactionService sees one interface. The same code path signs
  with a file keypair or asks a Ledger to confirm.
- Stubs for ledger, squads and remote make the port shape real and
  reviewable today. v2 implementations can land without touching the
  service or any command.
- The intent envelope is mandatory at sign time, so adding policy signers
  later does not require a schema migration.
- Keychain-backed signing is the recommended default on macOS and Windows;
  the encrypted on-disk fallback is the documented path for headless
  Linux (see `security.md`).

### Negative

- Six adapter shapes is more code than a single "load a keypair" helper.
  Mitigated by sharing implementation under
  `packages/signers/src/_base/` once a real second adapter (file plus
  keychain) is in. The base helpers are not introduced speculatively.
- The Squads stub raises a UX question (a "signature" is actually a
  proposal). The stub's error message names the upcoming proposal flow so
  the eventual UX is not a surprise.

## Alternatives considered

### A. A callback signer `(tx) => Promise<signed>`

Rejected. No place for the intent envelope; commands would need to know
which signer can handle which intent kinds.

### B. One concrete signer per command

Each command picks a signer class directly. Rejected. Couples commands to
the keychain library, the Ledger transport and so on; violates the
import rules in AGENTS.md.

### C. Defer Ledger/Squads/remote until v2 with no stubs

Implement only file, env and keychain; introduce the other three when
they are real. Rejected. The port shape is the load-bearing decision; a
shape that has never been exercised by three distinct adapters is a shape
that does not yet exist. Stubs cost little and prove the shape.
