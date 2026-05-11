# CLAUDE.md - Project Conventions

## Stack

- Runtime: Node.js 22 LTS (`.nvmrc` pins 22)
- Language: TypeScript 6.x, strict mode, project references
- CLI framework: Citty 0.2.x
- Test: Vitest 4.x; integration tests spawn the built binary via `execa`
- Lint/format: Biome 2.x
- Bundle: tsup 8.x
- Package manager: pnpm 11.x with workspace catalogs
- Logging: pino 10 + pino-roll + redaction
- Secrets: @napi-rs/keyring (primary), AES-256-GCM + argon2id (encrypted-file fallback)

## Commands

| Command | Action |
| --- | --- |
| `pnpm typecheck` | TypeScript project-reference check |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome auto-fix |
| `pnpm test` | Vitest workspace |
| `pnpm build` | Build packages, generate command manifest, bundle CLI |
| `pnpm verify:architecture` | Enforce module boundary rules |
| `pnpm verify:deps` | Enforce catalog/workspace dependency specs |
| `pnpm package:smoke` | Pack and install the CLI tarball |
| `pnpm perf:startup` | Measure help/version startup latency |

## Style

- ESM only. `"type": "module"` in every package.
- Use `.js` specifiers in TypeScript source imports.
- Use `node:` prefix for built-in imports.
- No `any` at module boundaries. Use `unknown` plus narrowing.
- No comments unless they explain a non-obvious why.

### Prose style (binding for every file in the repo: docs, source comments, log messages, error messages)

- **No em dashes or en dashes.** Never use U+2014 (em dash) or U+2013 (en dash). Use one of these instead:
  - `;` for two independent clauses
  - `:` for a definition or expansion
  - `,` or `(`...`)` for a parenthetical aside
  - `.` for a new sentence
- **No Oxford (serial) commas.** In a list of three or more items, do not put a comma before the final `and` / `or`. Write `red, white and blue`, not the comma-before-and form.
- These rules apply to every author including AI assistants. Before opening a PR, run the prose check (zero hits required for the first regex):
  - `rg -P '\x{2014}|\x{2013}'` (PCRE2 mode; matches em dash U+2014 and en dash U+2013)
  - `rg ", [^,.;:!?\\n]+, (and|or) "` (manually review any hits; not every match is an Oxford comma, but every Oxford comma is a match)

## Architecture

- [`AGENTS.md`](./AGENTS.md): binding module boundary rules + prose style.
- [`docs/architecture.md`](./docs/architecture.md): component overview.
- [`docs/architecture-providers.md`](./docs/architecture-providers.md): the
  provider layer (Hexagonal, ports, ACL, operations, vendor escape hatch).
  Mandatory reading before touching anything under `packages/providers/` or
  `apps/cli/src/operations/`.
- [`docs/adr/`](./docs/adr/README.md): Architecture Decision Records.
  Load-bearing decisions live here, one per file. Treat as immutable once
  accepted; new decisions get new numbers.

## Where things live

| Concern | Path |
| --- | --- |
| Entrypoint | `apps/cli/bin/solcli.ts` |
| CLI runtime composition | `apps/cli/src/context.ts` |
| Commands | `apps/cli/src/commands/<group>/<verb>.command.ts` |
| Generated manifest | `apps/cli/src/generated/commands.ts` |
| Contracts | `packages/contracts/src/` |
| Runtime packages | `packages/{config,secrets,logger,output,prompts,cache,providers}/src/` |
| Platform helpers | `packages/platform/src/` |
| Vendor adapters | `packages/providers/src/vendors/<vendor>/` (see `docs/architecture-providers.md`) |
| Operations layer | `apps/cli/src/operations/` (per-port resolution + fallback) |
| Package unit tests | `packages/<name>/tests/` |
| CLI tests | `apps/cli/tests/` |
| Verification scripts | `scripts/` |

## Adding a command

1. Create `apps/cli/src/commands/<group>/<name>.command.ts`.
2. Use `defineCommand` from Citty; `run` uses `withContext(async (ctx) => ...)`.
3. Throw typed failures through `ctx.errors.*(...)`.
4. `pnpm build` regenerates `apps/cli/src/generated/commands.ts` and bundles.

No package implementation edits are required. See `docs/adding-commands.md`.

## v1 (Solana) - deferred work

- Concrete RPC client wrapping `@solana/kit` + undici keep-alive
- TransactionService (build -> simulate -> fee -> sign -> send -> confirm)
- WalletManager (file/env/Ledger signers)
- Helius adapter implementation (`packages/providers/src/vendors/helius/`)
- Triton adapter implementation (`packages/providers/src/vendors/triton/`)
- Solana-specific commands (balance, portfolio, token transfer, airdrop, tx, etc.)
