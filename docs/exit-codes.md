# Exit Codes

solcli follows BSD `sysexits` conventions where applicable, with app-specific
codes 1-63 mapped to typed error classes.

| Exit | Code constant                                | Class                                | Meaning                              |
|------|----------------------------------------------|--------------------------------------|--------------------------------------|
| 0    | -                                            | -                                    | Success                              |
| 1    | `SOLCLI_E_GENERIC`                           | `SolcliError`                        | Generic / fallback                   |
| 2    | `SOLCLI_E_USAGE`                             | `UsageError`                         | Bad CLI args                         |
| 10   | `SOLCLI_E_CONFIG`                            | `ConfigError`                        | Config load/parse/write              |
| 11   | `SOLCLI_E_SECRET`                            | `SecretError`                        | Keychain / encrypted-file            |
| 12   | `SOLCLI_E_NO_SIGNER`                         | `SignerError`                        | (reserved v1) Wallet/signer          |
| 20   | `SOLCLI_E_RPC`                               | `RpcError`                           | (reserved) RPC failure               |
| 21   | `SOLCLI_E_RPC_RATELIMIT`                     | `RpcRateLimitError`                  | (reserved) RPC 429                   |
| 22   | `SOLCLI_E_BLOCKHASH_EXPIRED`                 | `BlockhashExpiredError`              | (reserved) Blockhash retry exhausted |
| 23   | `SOLCLI_E_INSUFFICIENT_FUNDS`                | `InsufficientFundsError`             | (reserved)                           |
| 24   | `SOLCLI_E_SIM_FAILED`                        | `SimulationError`                    | (reserved)                           |
| 30   | `SOLCLI_E_PROVIDER`                          | `ProviderError`                      | (reserved) Provider failure          |
| 31   | `SOLCLI_E_PROVIDER_CAPABILITY_UNSUPPORTED`   | `ProviderCapabilityUnsupportedError` | No provider supports the capability  |
| 40   | `SOLCLI_E_NO_INPUT`                          | `NonInteractiveError`                | Prompt in non-interactive mode       |
| 69   | `SOLCLI_E_EX_UNAVAILABLE`                    | `ServiceUnavailableError`            | sysexits EX_UNAVAILABLE              |
| 70   | `SOLCLI_E_INTERNAL`                          | `InternalError`                      | Uncaught / bug                       |
| 74   | `SOLCLI_E_IO`                                | `IoError`                            | Filesystem error                     |
| 130  | -                                            | (signal)                             | SIGINT (128 + 2)                     |
| 143  | -                                            | (signal)                             | SIGTERM (128 + 15)                   |

In `--output json` mode, the JSON envelope carries `exitCode`. The process
exit code matches.

This table is also available at runtime via `solcli help exit-codes`.

## Foundation flow additions (2026-05-11)

The codes below extend the table above. They cover the foundation flow work
introduced by ADR-0008 through ADR-0020 (signer, safety gate, transaction
service, plugin runtime, IDL fetcher, MCP transport and event sink). Existing
entries are unchanged; these are additive.

| Exit | Code constant                          | Class                              | Meaning                                            |
|------|----------------------------------------|------------------------------------|----------------------------------------------------|
| 69   | `SOLCLI_E_SIGNER_NOT_AVAILABLE`        | `SignerNotAvailableError`          | Signer backend unreachable (Ledger, keychain)      |
| 77   | `SOLCLI_E_SIGNER_REFUSED`              | `SignerRefusedError`               | User rejected on-device approval                   |
| 77   | `SOLCLI_E_SIGNER_PERMISSIONS_INSECURE` | `SignerPermissionsInsecureError`   | Keypair file mode allows group or world access     |
| 65   | `SOLCLI_E_SAFETY_BUDGET_EXCEEDED`      | `SafetyBudgetExceededError`        | Spend exceeds the configured safety budget         |
| 78   | `SOLCLI_E_SAFETY_INTENT_REQUIRED`      | `SafetyIntentRequiredError`        | Write op needs explicit confirmation flag          |
| 65   | `SOLCLI_E_SAFETY_PROGRAM_DENIED`       | `SafetyProgramDeniedError`         | Program id blocked by the safety allowlist         |
| 75   | `SOLCLI_E_TX_BLOCKHASH_EXPIRED`        | `TxBlockhashExpiredV2Error`        | Blockhash expired inside the safety gate; retry    |
| 65   | `SOLCLI_E_TX_SIMULATE_FAILED`          | `TxSimulateFailedError`            | Pre-flight simulation reported a failure           |
| 65   | `SOLCLI_E_PLUGIN_INVALID_MANIFEST`     | `PluginInvalidManifestError`       | Plugin manifest is malformed or missing fields     |
| 77   | `SOLCLI_E_PLUGIN_INTEGRITY_MISMATCH`   | `PluginIntegrityMismatchError`     | Plugin hash does not match pinned digest           |
| 78   | `SOLCLI_E_PLUGIN_UNVERIFIED`           | `PluginUnverifiedError`            | Plugin not on the trust list; user must opt in     |
| 65   | `SOLCLI_E_IDL_NOT_FOUND`               | `IdlNotFoundError`                 | Anchor IDL missing for the requested program       |
| 64   | `SOLCLI_E_MCP_TRANSPORT_UNSUPPORTED`   | `McpTransportUnsupportedError`     | Requested MCP transport not supported by this CLI  |
| 65   | `SOLCLI_E_EVENT_SINK_UNAVAILABLE`      | `EventSinkUnavailableError`        | Configured event sink could not be reached         |
