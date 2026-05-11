# @solcli/tx

Transaction service for solcli. Orchestrates the canonical write-path pipeline so callers (commands, agents, protocol modules) do not have to know which port hosts which stage.

The pipeline runs in six stages: build, simulate, fee, sign, send and confirm. Every stage takes an `AbortSignal` and emits a typed `EventRecord` through the optional `EmitEventPort`. The send stage refreshes the blockhash and re-signs on `SOLCLI_E_TX_BLOCKHASH_EXPIRED` up to three attempts; the whole `execute` body is wrapped in `withIdempotency` so a repeat call with the same key returns the cached signature without re-running the pipeline.
