# solcli Architecture

## Overview

solcli is a cross-platform Solana CLI written in TypeScript and built on Node 22.
v0 ships CLI infrastructure plus scaffolding for the v1 Solana implementation.
The repository is a pnpm workspace: `apps/cli` owns the binary and command tree,
while reusable runtime concerns live in internal `@solcli/*` packages.

## Component Diagram

```
apps/cli/bin/solcli.ts
  -> Citty rootCommand (apps/cli/src/registry.ts)
     -> Context (apps/cli/src/context.ts)
        -> @solcli/config
        -> @solcli/output
        -> @solcli/logger
        -> @solcli/secrets
        -> @solcli/prompts
        -> @solcli/cache
        -> @solcli/providers
        -> version check
     -> Commands (apps/cli/src/commands/, auto-discovered)
```

## Architectural Principles

1. Contracts-first boundaries: `packages/contracts` contains type contracts only.
2. Manual DI via Context: `apps/cli/src/context.ts` is the only runtime composition layer.
3. Commands stay thin: command files use context services and do not import concrete packages.
4. Lazy side effects: logger file streams and keyring probing occur only when used.
5. Stable errors: typed `SolcliError` subclasses produce stable `SOLCLI_E_*` codes.
6. Cross-platform IO: paths, color, TTY, signals and line endings are platform-aware.

## Build Pipeline

`pnpm build` runs workspace package builds, then the CLI package:

1. `apps/cli/scripts/build-registry.ts` walks `apps/cli/src/commands/**/*.command.ts`,
   synthesizes missing groups and emits `apps/cli/src/generated/commands.ts`.
2. `tsup` bundles the installable CLI binary under `apps/cli/dist/bin/solcli.js`.
3. `tsc -p apps/cli/tsconfig.types.json` emits the public app declarations.

## Tests and Gates

- Package tests live under `packages/<name>/tests`.
- CLI unit and integration tests live under `apps/cli/tests`.
- `pnpm verify:architecture` enforces layer boundaries.
- `pnpm verify:deps` enforces `catalog:` and `workspace:*` dependency policy.
- `pnpm package:smoke` verifies the packed tarball installs and runs.
- `pnpm perf:startup` measures help/version startup latency.

## v1 (Solana) - Deferred

Future work lands the concrete RPC client, TransactionService, WalletManager and vendor adapters. The adapter shape and split criteria are documented in [`architecture-providers.md`](./architecture-providers.md); see `packages/providers/src/vendors/helius/README.md` and `packages/providers/src/vendors/triton/README.md` for vendor-specific notes.
