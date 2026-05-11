# Cross-Platform Behavior

solcli runs on macOS, Linux and Windows with no platform-specific commands.

## Filesystem paths

Resolved via `env-paths` (no `-nodejs` suffix):

| OS      | Config                                | Data                                     | Cache                            | Log                       |
|---------|---------------------------------------|------------------------------------------|----------------------------------|---------------------------|
| Linux   | `$XDG_CONFIG_HOME/solcli`             | `$XDG_DATA_HOME/solcli`                  | `$XDG_CACHE_HOME/solcli`         | `$XDG_STATE_HOME/solcli`  |
| macOS   | `~/Library/Preferences/solcli`        | `~/Library/Application Support/solcli`   | `~/Library/Caches/solcli`        | `~/Library/Logs/solcli`   |
| Windows | `%APPDATA%\solcli\Config`             | `%LOCALAPPDATA%\solcli\Data`             | `%LOCALAPPDATA%\solcli\Cache`    | `%LOCALAPPDATA%\solcli\Log` |

Implementation: `packages/platform/src/paths.ts` (`buildPaths()`).

## Secrets storage

- macOS: Keychain Services via `@napi-rs/keyring`.
- Windows: Credential Manager via `@napi-rs/keyring`.
- Linux (with libsecret / dbus): Secret Service via `@napi-rs/keyring`.
- Linux (headless / no dbus): encrypted-file fallback at
  `<data-dir>/solcli/secrets.enc.ndjson` with AES-256-GCM cipher, argon2id key
  derivation (t=3, m=64 MiB, p=4, dkLen=32). The master key is read from the
  `SOLCLI_MASTER_KEY` environment variable.

solcli probes the keyring at first use and silently falls back to the
encrypted-file backend on probe failure. Run `solcli doctor --output json` to
inspect the active backend.

## Line endings

solcli's machine-consumed data files (config.toml, secrets.enc.ndjson, log
files) use LF terminators on every platform. NDJSON output uses LF only.
Human-readable files written for local consumption may use the OS's native line
ending. See `packages/platform/src/signals.ts`.

## Signals

solcli installs SIGINT and SIGTERM handlers via `installSignalHandlers()`:

- SIGINT -> abort the in-flight `AbortController`, exit 130.
- SIGTERM -> abort, exit 143.

In-flight HTTP requests (v1) MUST observe `ctx.abortController.signal` for
clean cancellation.

## Color

ANSI color is auto-disabled when:

- `--no-color` flag is set, OR
- `NO_COLOR` env var is set (per https://no-color.org), OR
- stdout is not a TTY.

`FORCE_COLOR` (per https://force-color.org) overrides the TTY check.

## Interactive input

Prompts (via `@clack/prompts`) refuse to run when:

- `--no-input` flag is set, OR
- `CI` env var is set, OR
- `NO_INPUT` env var is set, OR
- stdout is not a TTY.

In any of these conditions, prompts throw `SOLCLI_E_NO_INPUT` (exit 40).
