# solcli

Cross-platform Solana CLI for humans and automation. TypeScript, Node 22 LTS,
agent-first design.

Status: v0 - CLI infrastructure. Solana protocol implementation arrives in v1.

## Install

Not yet published to npm. For development:

```bash
git clone https://github.com/ZODs-Labs/solcli.git
cd solcli
pnpm install
pnpm build
node apps/cli/dist/bin/solcli.js --help
```

For a local global symlink during development:

```bash
pnpm link --global
solcli --help
```

## Quickstart

```bash
# Show the usage tree
solcli --help

# Topic help
solcli help exit-codes
solcli help json-output
solcli help providers
solcli help formatting

# Inspect the installation
solcli doctor --output json

# Config: write and read
solcli config set network devnet
solcli config get network
solcli config list

# Secrets: stored in OS keyring (or encrypted-file fallback on headless Linux)
solcli secrets set helius.apiKey --value "<your-key>"
solcli secrets list
solcli secrets get helius.apiKey               # reports presence (does not print value)
solcli secrets get helius.apiKey --reveal --yes
solcli secrets rm helius.apiKey --yes

# Reference / plugin example (template for new commands)
solcli plugin example demo --count 3 --output json
```

## Agent mode

```bash
solcli <command> --output json --no-input
```

See `docs/agent-mode.md` for the JSON envelope, exit codes, NDJSON streaming and the CI integration recipe.

## Development

```bash
pnpm typecheck        # TypeScript project references
pnpm lint             # Biome
pnpm test             # vitest (unit + integration)
pnpm build            # packages + command registry + bundled CLI
pnpm verify:architecture
pnpm verify:deps
pnpm package:smoke
pnpm perf:startup
```

CI runs the matrix `[ubuntu, macos, windows] x [Node 22]` on every push and PR.

## Architecture

See `docs/architecture.md`, `AGENTS.md` (module boundary rules) and `CLAUDE.md` (project conventions).

## Contributing

- New commands: drop a `*.command.ts` under `apps/cli/src/commands/` and rebuild. See
  `docs/adding-commands.md`.
- New DataProvider adapters: see `docs/providers.md`.

## License

MIT. Copyright 2026 ZODs Labs <support@zods.pro>
