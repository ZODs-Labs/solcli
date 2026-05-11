# @solcli/signer

Signer port wiring, adapter registry and per-alias audit log for solcli.

## What lives here

- `port.ts`: re-exports of `SignTransactionPort` and `SignerInfoPort` from
  `@solcli/contracts`, plus the internal `SignerAdapter` interface every
  adapter implements.
- `registry.ts`: `createSignerRegistry(deps)` produces a tiny registry that
  tracks aliases, lazily constructs adapters via an injected factory and
  exposes `get`, `list`, `add`, `remove`.
- `audit.ts`: NDJSON per-alias audit writer. One line per successful sign;
  atomic POSIX append with mode `0o600`.
- `adapters/file.ts`: encrypted-keystore signer. Verifies POSIX mode
  `0o600`; decrypts via the injected `SecretsCrypto`; zeroes key bytes
  after signing.
- `adapters/env.ts`: explicit opt-in env-var signer. Refused by default
  unless the caller sets `deps.allowEnv === true` (the consuming command
  surfaces the `--signer-allow-env` flag).
- `adapters/keychain.ts`: OS keychain-backed signer. Talks to the injected
  `KeychainBackend`; tests inject a `MemoryBackend`.
- `adapters/ledger.stub.ts`, `adapters/squads.stub.ts`,
  `adapters/remote.stub.ts`: stubs that report
  `SOLCLI_E_SIGNER_NOT_AVAILABLE`; added in B3.

## Design notes

- No top-level imports of heavy SDKs (`@ledgerhq/*`, `@sqds/multisig`,
  `@solana/kit`, `@solana/web3.js`). Stubs declare the shape locally and
  produce the documented error on sign; real implementations will arrive
  in downstream flows.
- All secret material is held as `Uint8Array` and zeroed (`fill(0)`) after
  use where the call shape allows. Key bytes never enter a log.
- Every async I/O method takes an `AbortSignal`. Aborts surface as
  `SOLCLI_E_ABORTED` per `.claude/rules/typescript/async.md`.
- The audit log is advisory: a write failure logs a warning and signing
  proceeds. The alias is included on every audit line for grep-friendly
  forensics.
