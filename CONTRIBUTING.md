# Contributing to solcli

Thanks for your interest. solcli is a TypeScript-only, ESM-only, Node 22+ project organized as
a pnpm workspace.

## Prerequisites

- Node.js 22 LTS or newer (see `.nvmrc`)
- pnpm 11 (see `packageManager` in `package.json`)
- macOS, Linux or Windows. CI runs all three.

## Setup

```bash
git clone https://github.com/ZODs-Labs/solcli.git
cd solcli
pnpm install
pnpm build
```

## Workflow

```bash
pnpm typecheck             # tsc -b across the workspace
pnpm lint                  # Biome
pnpm test                  # vitest unit + integration
pnpm build                 # build registry + tsup bundle
pnpm verify:architecture   # boundary enforcement
pnpm verify:deps           # unused / missing deps
pnpm package:smoke         # npm pack + install in a temp dir
pnpm perf:startup          # startup p50/p95 benchmark
```

A pull request must pass **all** of the above on the matrix `[ubuntu, macos, windows]`.

## House rules

- **Strict TypeScript.** Every flag in `tsconfig.base.json` is non-negotiable. No `any`.
  Use `unknown` and narrow. `as` is only acceptable at validation boundaries.
- **ESM only.** `import "./foo.js"` (with `.js`) in `.ts` source.
- **No `console.*`** outside the entrypoint's last-resort crash handler. Use the structured
  logger.
- **stdout = result data, stderr = everything else.** This is the agent-first contract;
  breaking it breaks every shell pipeline downstream.
- **Errors are typed.** Throw a `SolcliError` subclass with a stable `SOLCLI_E_*` code and
  an `exitCode`. Never throw strings or raw `Error` across module boundaries.
- **Tests live next to source.** Unit tests in `**/tests/unit/`, integration tests in
  `apps/cli/tests/integration/`.
- **Boundary rules.** Commands import only from `apps/cli/src/context.ts`; never from
  concrete `@solcli/*` packages directly. The `verify:architecture` script enforces this.

## Adding a command

Drop a single file at `apps/cli/src/commands/<group>/<name>.command.ts` (or
`apps/cli/src/commands/<name>.command.ts` for a top-level command). The registry is
generated automatically by `scripts/build-registry.ts` on build. No core files need
editing.

See `docs/adding-commands.md` for the template.

## Commit style

We follow conventional commits:

- `feat: …` new feature
- `fix: …` bug fix
- `refactor: …` non-functional change
- `docs: …` documentation
- `test: …` tests
- `chore: …` tooling, deps

## Reporting bugs

Use GitHub Issues: <https://github.com/ZODs-Labs/solcli/issues>. Include:

- solcli version (`solcli --version`)
- OS and Node version
- Exact command run, with `--verbose` if applicable
- The full error envelope (in `--output json` mode it's parseable)

## Security

Please **do not** open a public issue for security reports. See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree your contributions are licensed under MIT (the project license).
