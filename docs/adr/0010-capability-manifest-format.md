# ADR-0010: Capability manifest format and runtime overlay

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0006](./0006-capability-manifest.md), [ADR-0011](./0011-mcp-bridge-inside-binary.md), [ADR-0012](./0012-three-tier-extension-model.md), [ADR-0015](./0015-anchor-idl-tier-0-protocol-adds.md), [ADR-0017](./0017-stability-tiers.md).

## Context

ADR-0006 establishes that each provider exposes a `ProviderManifest` so
the registry can reason about port coverage. The same shape of question
applies one layer up: agents, MCP clients, the help system and the plugin
loader all need to ask "which commands exist, what arguments do they
take, what is each one's stability tag and what permissions does it
need?" without spawning the CLI once per command to read `--help`.

The answer must be available in two forms:

1. As a build artifact shipped with the binary, so the canonical command
   surface is queryable offline and the MCP bridge (ADR-0011) can list
   tools without dispatching every command.
2. As a runtime view that includes any installed plugin contributions
   (ADR-0012), since plugins extend the command tree without
   regenerating the build-time artifact.

The argument schemas come from each command's Zod input schema. Producing
JSON Schema from Zod at build time gives MCP clients the same validation
shape the CLI uses, without depending on Zod in the consumer.

## Decision

A build-time manifest is generated at
`apps/cli/src/generated/manifest.json`. The generator runs from
`apps/cli/scripts/build-registry.ts` (next to the command-registry
generator). It walks the command tree, reads each command's Zod input
schema, converts each schema to JSON Schema via `zod-to-json-schema` and
emits one record per command.

### Record shape

```json
{
  "version": 1,
  "generatedAt": "2026-05-11T00:00:00Z",
  "cliVersion": "0.1.0",
  "commands": [
    {
      "path": ["token", "balance"],
      "summary": "Show the balance of a token account.",
      "stability": "stable",
      "argsSchema": { "$schema": "http://json-schema.org/draft-07/schema#", "...": "..." },
      "outputs": ["human", "json", "ndjson", "csv"],
      "writes": false,
      "requires": { "ports": ["GetTokenAccountPort"], "signer": false, "network": ["rpc"] },
      "source": { "kind": "core", "file": "apps/cli/src/commands/token/balance.command.ts" }
    }
  ]
}
```

Required fields per record:

- `path`: the command path as an array (matches the directory layout).
- `summary`: one-line human description (from the command's `meta.description`).
- `stability`: one of `alpha`, `beta`, `stable` (see ADR-0017).
- `argsSchema`: JSON Schema (Draft 07) derived from the command's Zod schema.
- `outputs`: the output modes the command supports.
- `writes`: true if the command can sign or submit a transaction.
- `requires.ports`: the port names (see ADR-0006) the command resolves
  through the operations layer.
- `requires.signer`: true if the command requests a signer.
- `requires.network`: which network surfaces the command touches (`rpc`,
  `bundle`, `none`).
- `source.kind`: `core` for built-in commands, `idl` for synthesized
  Anchor commands (ADR-0015), `plugin` for plugin contributions
  (ADR-0012).

### Runtime overlay

At CLI startup, the loaded plugins (ADR-0012) and any IDL drops
(ADR-0015) contribute additional command records. The runtime composes:

```
manifest.runtime = manifest.build ∪ overlay(plugins) ∪ overlay(idls)
```

The runtime manifest is exposed through:

- `solcli manifest` (human, json and ndjson output modes).
- `solcli mcp serve`'s tool-list response (ADR-0011).
- The `--manifest` flag for any agent that wants the full surface without
  parsing `--help`.

The composition is deterministic: plugin records are sorted by plugin id
then by command path; IDL records are sorted by program id then by
instruction. The runtime manifest's `generatedAt` reflects the latest
contribution.

### Stability surfacing

Every record carries a `stability` tag. The default tag for synthesized
IDL commands is `alpha` (per ADR-0015). The default for plugin commands
is the value declared in the plugin's permission manifest (ADR-0020); a
plugin that omits the tag is treated as `alpha`. The manifest filters
`alpha` records by default; `--include alpha` opts in. See ADR-0017 for
the full filter rules.

### Validation contract

The build emits a JSON Schema for the manifest itself at
`apps/cli/src/generated/manifest.schema.json`. CI runs `pnpm verify:architecture`,
which validates `manifest.json` against `manifest.schema.json` and refuses
the build on drift.

## Consequences

### Positive

- Agents and MCP clients have a single, authoritative document describing
  the surface. No spawning the CLI per command to read help text.
- The manifest is a value, not a behavior: it can be inspected, diffed
  and posted to a documentation site without running the binary.
- Plugin and IDL contributions fit the same shape, so MCP tool listing
  and `solcli --help` see the same tree.
- The JSON Schema for arguments lets MCP clients validate their tool-call
  payloads ahead of dispatch, surfacing input errors without a round trip.

### Negative

- The build artifact must stay in sync with the running CLI. CI guards
  this; a drifted manifest fails the build.
- `zod-to-json-schema` does not preserve every Zod refinement. Custom
  refinements that the JSON Schema cannot represent are tagged in the
  schema's `description` and re-checked at command dispatch.

## Alternatives considered

### A. Generate the manifest from help text

Scrape `--help` per command. Rejected. Help text is for humans, varies
with terminal width and does not carry validation shape.

### B. Hand-author the manifest

Maintain `manifest.json` next to the command tree. Rejected. Drift is
inevitable; the command's Zod schema is already the source of truth.

### C. Skip JSON Schema and let MCP clients introspect Zod

Rejected. The CLI cannot ship Zod across the MCP boundary; consumers may
be written in any language. JSON Schema is the lingua franca for tool
input validation.
