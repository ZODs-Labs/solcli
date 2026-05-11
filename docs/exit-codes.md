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
