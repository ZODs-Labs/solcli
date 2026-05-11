# Changelog

All notable changes to solcli are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-05-11

Initial public release. CLI infrastructure only. Solana protocol commands arrive in v0.1.

### Added

- pnpm workspace monorepo: `apps/cli` + 14 internal `@solcli/*` packages.
- Strict TypeScript 6 configuration with project references.
- Citty-based command dispatcher with auto-discovery of `*.command.ts` files (no manual
  registry edits required for new commands).
- Output formatters: `human` (default on TTY), `json` (default off-TTY), `ndjson`, `csv`.
- Stable JSON error envelope (`schemaVersion`, `code`, `message`, `exitCode`, `cause`)
  emitted from a single error boundary at the entrypoint.
- Stable `SOLCLI_E_*` error codes and exit-code mapping (sysexits-style).
- Configuration layer with TOML files, env-var overrides and CLI-flag precedence.
- Secrets layer: OS keyring (macOS Keychain, Windows Credential Manager,
  freedesktop secret service) with AES-256-GCM encrypted-file fallback.
- Logger: pino with redaction and daily rotation (`pino-roll`).
- `doctor` command for installation diagnosis.
- Topic-based help: `solcli help exit-codes | json-output | providers | formatting`.
- Cross-platform CI matrix `[ubuntu, macos, windows] × [Node 22]`.

### Security

- Secrets never accepted on the command line: file, env var or keyring only.
- Encrypted-file fallback uses random IV, Argon2id KDF, authenticated encryption (GCM).
- Logger redaction covers `apiKey`, `privateKey`, `mnemonic`, `password`, `authorization`,
  and provider-namespaced variants.
- POSIX `0o600` mode enforced on secret files.
