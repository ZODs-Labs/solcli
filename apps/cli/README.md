# solcli

Cross-platform Solana CLI for humans and automation. TypeScript, Node 22+, agent-first.

> **Status:** v0.0.1, CLI infrastructure only. Solana protocol commands (RPC, wallet, swap etc.) arrive in v0.1.

## Install

```bash
npm install -g solcli
# or
pnpm add -g solcli
```

```bash
solcli --version
solcli --help
```

## Quick start

```bash
# Show the command tree
solcli --help

# Topic-based help
solcli help exit-codes
solcli help json-output
solcli help providers

# Check installation
solcli doctor --output json

# Config
solcli config set network devnet
solcli config get network
solcli config list

# Secrets (OS keyring; encrypted-file fallback on headless Linux)
solcli secrets set helius.apiKey --value "<your-key>"
solcli secrets list
solcli secrets get helius.apiKey                 # reports presence only
solcli secrets get helius.apiKey --reveal --yes  # prints plaintext

# Reference command (copy this as a template for new commands)
solcli plugin example demo --count 3 --output ndjson
```

## Agent mode

solcli is designed to be invoked by AI agents and shell scripts as much as by humans.

```bash
solcli <command> --output json --no-input
```

When stdout is not a TTY (i.e. piped to `jq`, captured by a script or run by an agent),
solcli automatically switches the default output mode to `json`. Pass `--output human`
to force human formatting in pipelines.

### Stable error envelope

Every error, whether from a command, argument parsing or a missing secret, is
emitted as a single-line JSON envelope when `--output json` or `--output ndjson`
is active, or when stdout is non-TTY:

```json
{
  "schemaVersion": 1,
  "error": {
    "schemaVersion": 1,
    "code": "SOLCLI_E_SECRET",
    "message": "Secret not found: helius.apiKey",
    "exitCode": 11,
    "cause": null
  }
}
```

The `code` (`SOLCLI_E_*`) and `exitCode` are **stable contracts**. Agents may dispatch on either.

### Exit codes

| Exit | Code | Meaning |
|------|------|---------|
| 0  |  | Success |
| 1  | `SOLCLI_E_GENERIC` | Generic failure |
| 2  | `SOLCLI_E_USAGE` | Bad CLI args / unknown command |
| 10 | `SOLCLI_E_CONFIG` | Config load/parse/write |
| 11 | `SOLCLI_E_SECRET` | Keychain / encrypted-file failure |
| 40 | `SOLCLI_E_NO_INPUT` | Prompt requested in non-interactive mode |
| 70 | `SOLCLI_E_INTERNAL` | Uncaught error (bug) |
| 130 |  | SIGINT |
| 143 |  | SIGTERM |

Full list: `solcli help exit-codes`.

### Output formats

- `--output human` (default on TTY): tables and key/value blocks, ANSI colors honored, respects `NO_COLOR`.
- `--output json` (default off-TTY): a single envelope on stdout.
- `--output ndjson`: one JSON object per line. Collections are fanned out per record.
- `--output csv`: header row + one row per record.

Logs and progress always go to **stderr**. stdout is reserved for the command's result data.

## Configuration

Precedence: CLI flag > environment variable > config file > built-in default.

Config file: TOML at the platform-correct config dir.

| Platform | Path |
|----------|------|
| macOS    | `~/Library/Application Support/solcli/config.toml` |
| Linux    | `$XDG_CONFIG_HOME/solcli/config.toml` (default `~/.config/solcli/config.toml`) |
| Windows  | `%APPDATA%\solcli\config.toml` |

See `solcli config list` to view the effective merged config.

## Secrets

solcli stores secrets in the OS keyring by default:

- macOS Keychain
- Windows Credential Manager
- freedesktop secret service (libsecret) on Linux

On headless Linux or when the keyring is unavailable, solcli falls back to an AES-256-GCM
encrypted file with the master key from `$SOLCLI_MASTER_KEY` or an interactive passphrase.

## License

MIT © ZODs Labs

Repo / issues: <https://github.com/ZODs-Labs/solcli>
