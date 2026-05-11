# AGENTS.md: Module Boundary and Style Rules

This file is binding for any agent (human or automated) modifying solcli.
Violations are bugs. The structural rules in this document are enforced by
`pnpm verify:architecture` (see `scripts/verify-boundaries.ts`).

For stack versions, package scripts, "where things live" pointers and the
architectural overview, see [`CLAUDE.md`](./CLAUDE.md) and
[`docs/architecture.md`](./docs/architecture.md). The provider layer
(Hexagonal, ports, ACL, operations, vendor escape hatch) is documented in
detail in [`docs/architecture-providers.md`](./docs/architecture-providers.md);
load-bearing decisions are captured as [ADRs](./docs/adr/README.md).
This document covers only the machine-enforced rules and the binding style
rules.

## Directory ownership

```
apps/cli/bin/                  CLI entrypoint. Single file.
apps/cli/src/context.ts        Runtime composition boundary.
apps/cli/src/registry.ts       Root command definition (citty defineCommand).
apps/cli/src/commands/         Auto-discovered command tree. Files: *.command.ts.
apps/cli/src/generated/        Build-time emitted. Never edit by hand.
apps/cli/scripts/              Package-local build helpers (build-registry, prepack).
apps/cli/tests/                CLI command and integration tests.
packages/contracts/src/        INTERFACES AND TYPES ONLY. No runtime exports.
packages/errors/src/           Error hierarchy and process-level handlers.
packages/platform/src/         Paths, TTY, signals, cross-platform helpers.
packages/<capability>/src/     One reusable runtime package per concern.
packages/providers/src/vendors/<vendor>/  One folder per first-party vendor (helius, triton, etc.).
scripts/                       Workspace-level build, verification, perf, smoke.
docs/                          User-facing documentation.
```

## Import rules

Enforced by `scripts/verify-boundaries.ts`. CI runs it on every PR.

1. **Commands** (`apps/cli/src/commands/**`) may import:
   - `citty`
   - Relative sibling files (local helpers within the same command tree)
   - `../../context.js` (the runtime composition boundary)
   - `@solcli/contracts` (type-only)
   - `@solcli/platform` (cross-platform helpers)

   Commands MUST NOT import any other `@solcli/*` package. Typed failures are
   constructed through the `ctx.errors.*(...)` factory exposed by the context,
   not by importing `@solcli/errors` directly.

2. **App composition** (`apps/cli/src/context.ts`, `apps/cli/src/registry.ts`,
   `apps/cli/bin/solcli.ts`) is the only layer that may wire concrete
   `@solcli/*` runtime packages together. It is the seam between the command
   layer and the implementation packages.

3. **`packages/contracts/**`** contains only TypeScript types and interfaces.
   No runtime `const`, no runtime `import`. Use `export type` and `import type`
   exclusively. Verified by a regex check in `verify-boundaries.ts`.

4. **Internal packages** (`packages/*/**`) may import other internal packages
   only through their public `@solcli/<name>` entry. Cross-package relative
   imports (`../<other-package>/...`) across the `packages/` boundary are
   forbidden.

5. **Internal packages** MUST NOT import `apps/cli/**` or any command file.

6. **Vendor adapters** (`packages/providers/src/vendors/<vendor>/**`) may import
   `@solcli/contracts` and the providers package's own siblings (`../../manifest.js`,
   `../../registry.js`). Each vendor folder is isolated: it MUST NOT import
   another vendor folder. Future shared adapter infrastructure (HTTP client,
   retry, error mapping) will live in `packages/providers/src/_base/` when v0.1
   lands; vendor folders may import from there but not from each other. See
   [`docs/architecture-providers.md`](./docs/architecture-providers.md) for
   the rationale and the criteria for splitting a vendor into its own package
   (none currently met).

## File naming

- Commands: `apps/cli/src/commands/<noun>/<verb>.command.ts`.
- Package tests: `packages/<name>/tests/*.test.ts`.
- CLI tests: `apps/cli/tests/unit/**` and `apps/cli/tests/integration/**`.
- Generated manifest: `apps/cli/src/generated/commands.ts`.

## How to add a command

1. Create `apps/cli/src/commands/<group>/<name>.command.ts` exporting a default
   `defineCommand` from citty.
2. Use `withContext(async (ctx) => ...)` for service access and `ctx.errors.*(...)`
   for typed failures.
3. Run `pnpm build`. `scripts/build-registry.ts` walks the commands tree,
   synthesizes any missing group commands, emits
   `apps/cli/src/generated/commands.ts`, and tsup bundles the result.

No core file edits are required for a new command.

## How to add a vendor adapter

1. Create `packages/providers/src/vendors/<vendor>/index.ts` exporting:
   - A `<VENDOR>_MANIFEST: ProviderManifest` defining `name`, `version` and the
     set of ports the adapter implements.
   - A `create<Vendor>Provider(opts): ProviderInstance` factory that wires
     port bindings into `makeProviderInstance(manifest, bindings)`.
2. Implement each port from `@solcli/contracts/src/ports/` in
   `packages/providers/src/vendors/<vendor>/ports/<port>.ts`. The port file is
   the Anti-Corruption Layer: vendor SDK types stop here.
3. Re-export the manifest and factory from `packages/providers/src/index.ts`.
4. Register the provider in `apps/cli/src/context.ts` or a composition helper
   owned by the app layer. Adapters do NOT auto-register at import time.

See [`docs/architecture-providers.md`](./docs/architecture-providers.md) for
the full pattern and the criteria for splitting a vendor into its own package.

## Prose style (binding for every file: docs, source comments, log messages, errors)

- **No em dashes or en dashes.** Never use U+2014 (em dash) or U+2013 (en dash).
  Use one of:
  - `;` for two independent clauses
  - `:` for a definition or expansion
  - `,` or `(`...`)` for a parenthetical aside
  - `.` for a new sentence
- **No Oxford (serial) commas.** In a list of three or more items, do not put a
  comma before the final `and` / `or`. Write `red, white and blue`, not the
  comma-before-and form.
- These rules apply to every author including AI assistants. Before opening a PR,
  run the prose check (the first regex must report zero hits in tracked files):
  - `rg -P '\x{2014}|\x{2013}'`
  - `rg ", [^,.;:!?\\n]+, (and|or) "` (manually review any hits; not every match
    is an Oxford comma, but every Oxford comma is a match)
