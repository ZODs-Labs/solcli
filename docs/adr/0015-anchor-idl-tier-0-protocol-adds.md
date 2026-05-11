# ADR-0015: Anchor IDL tier-0 protocol synthesis

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0010](./0010-capability-manifest-format.md), [ADR-0012](./0012-three-tier-extension-model.md), [ADR-0017](./0017-stability-tiers.md).

## Context

Most Solana programs ship an Anchor IDL. The IDL describes every
instruction, every account role and every argument layout. A CLI that
already knows how to build, simulate, sign and confirm transactions
(ADR-0008) is one synthesizer away from being able to call any Anchor
program without a hand-written command. This is the fastest path to
"works with the long tail of Solana protocols".

Tier-0 means: the synthesized command path is automatic from the IDL,
the user gets a `solcli program <label> <ix>` surface and the system
makes no claims about the protocol's semantics. The synthesizer fills
the structural gap (instruction layout, account roles, argument types);
the protocol's higher-level UX (named accounts, role helpers, friendly
error messages) is the job of a hand-written or plugin-contributed
command that supersedes the synthesized one.

A clear promotion path matters. The synthesized command must be
discoverable enough to be useful and tagged carefully enough that a user
or agent does not mistake it for a stable, audited command.

## Decision

### IDL drop directory

IDLs live under `${SOLCLI_DATA_DIR}/idls/<programId>.json`. The path
resolves through `packages/platform`'s data-directory helper so it is
correct on every platform.

- A user opts a program in by writing the IDL to that path. The CLI
  never fetches IDLs from the network without an explicit opt-in.
- A `solcli idl add <programId> [--from <pathOrUrl>]` helper resolves
  the IDL, computes its SHA-256 digest and writes it atomically.
- A `solcli idl list` lists every program with an IDL on disk along
  with its synthesized command path.

### Label resolution

The synthesized command path is `solcli program <label> <ix>` where
`<label>` is one of, in precedence:

1. The user-set label in `${SOLCLI_DATA_DIR}/idls/labels.toml`.
2. The IDL's `metadata.name` field if present.
3. A short hash of the program id (first 8 base58 chars).

The user-set label resolves collisions and gives `solcli --help` a
human-readable surface.

### Synthesizer

The synthesizer runs at startup (after the build-time manifest from
ADR-0010 is loaded). For each IDL on disk, it emits:

- One Citty command per instruction at `program/<label>/<ix>.command.ts`
  (virtual; not written to disk).
- The Zod schema for the instruction's arguments, derived from the
  IDL's `args` types.
- The account-role list for the instruction, mapped to the intent
  envelope's writable-account set (ADR-0008).
- A manifest contribution that overlays the runtime manifest
  (ADR-0010), with `source.kind: "idl"`.

The synthesized command goes through the same TransactionService, the
same safety gates (ADR-0013) and the same events channel (ADR-0014) as
any other write command.

### Stability tag

Every synthesized command carries `stability: "alpha"` by default.
ADR-0017 documents the manifest's default-filter for alpha commands.
The user opts in to listing or invoking them with `--include alpha`.

### Promotion path

A synthesized command is promoted by replacing it. There is no
"promote in place" operation; an IDL-driven command stays alpha for the
lifetime of its synthesis.

Promotion to `beta` or `stable` requires a hand-written command (or a
tier-2 plugin command per ADR-0012) at the same command path
(`program/<label>/<ix>`). The runtime manifest's overlay rule shadows
the synthesized record with the hand-written one. The hand-written
command may delegate most of its work back to the synthesizer (the
shared schema, the account-role mapping) while carrying the curated UX
that beta and stable demand.

The hand-written command must:

- Cover every instruction the synthesized command covered, OR explicitly
  declare the omitted ones in its `meta.deprecates` field so the
  manifest can surface the gap.
- Pass the same tests the protocol-specific suite would require for a
  beta or stable command (custom error mapping, named accounts, golden
  fixtures).

## Consequences

### Positive

- Day-one coverage of any Anchor program the user drops on disk.
- The promotion path is explicit and creates pressure to write curated
  commands for the protocols that matter to a given deployment.
- Alpha-by-default keeps the synthesized surface out of the default
  help text and out of the MCP tool catalogue unless an agent opts in
  with `--include alpha`.

### Negative

- Synthesized commands have generic UX (raw pubkeys, raw argument names).
  This is intentional; the promotion path exists precisely to fix that.
- IDLs can be incorrect or stale. The synthesizer trusts the IDL it was
  given; the user takes responsibility for the drop. Mitigated by
  recording the IDL digest in the synthesized command's manifest record
  so drift is observable.

## Alternatives considered

### A. Fetch IDLs at startup from a registry

Pull the canonical IDL for every well-known program at CLI startup.
Rejected for v1. Adds a network dependency to startup; a registry that
serves IDLs has its own integrity and availability questions; the
on-disk drop model is the simpler floor that a later ADR can extend.

### B. Synthesize at build time, ship the result

Generate every synthesized command from a fixed IDL set during the
solcli build. Rejected. The set of programs the user cares about is
not known at our build time; v1 must serve users with private or new
programs that did not exist when we shipped.

### C. Default the stability tag to beta

Treat the synthesized surface as ready for use. Rejected. Synthesized
commands have generic UX and no protocol-specific error handling; calling
them beta would mislead users and agents about audit posture.
