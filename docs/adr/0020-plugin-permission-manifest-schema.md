# ADR-0020: Plugin permission manifest schema

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0012](./0012-three-tier-extension-model.md), [ADR-0010](./0010-capability-manifest-format.md), [ADR-0017](./0017-stability-tiers.md).

## Context

ADR-0012 establishes that every plugin ships a permission manifest and
that three trust tiers (verified, community, local) describe how a
plugin reached the user's environment. This ADR specifies the manifest
shape, the integrity-hash format and the verified-tier registry
contract.

The contracts package is the only home for cross-package types
(`AGENTS.md` rule 3); the manifest type lives at
`packages/contracts/src/domain/plugin-manifest.ts`. The host validates
the manifest at load time with a Zod schema; the schema and the type
are derived from a single source.

## Decision

### `PluginManifest` shape

```ts
// packages/contracts/src/domain/plugin-manifest.ts
export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly stability: 'alpha' | 'beta' | 'stable';
  readonly entry: string;
  readonly contributes: {
    readonly commands?: ReadonlyArray<PluginCommandContribution>;
    readonly providers?: ReadonlyArray<PluginProviderContribution>;
    readonly signers?: ReadonlyArray<PluginSignerContribution>;
  };
  readonly permissions: PluginPermissions;
}
```

Field rules:

- `id` matches the npm package name pattern (with optional scope).
- `version` is semver. The runtime refuses to load a plugin whose
  on-disk version does not match the version pinned in
  `solcli.config.toml`.
- `entry` is a path relative to the plugin package root resolving to an
  ESM module that default-exports a plugin registration function.
- `stability` is the highest stability tag any contribution will claim;
  individual contributions may declare a lower tag.

### `PluginPermissions`

```ts
export interface PluginPermissions {
  readonly ports: ReadonlyArray<PortName>;
  readonly network: ReadonlyArray<NetworkAllowEntry>;
  readonly signer: 'none' | 'read' | 'sign';
  readonly fs?: ReadonlyArray<FsAllowEntry>;
  readonly env?: ReadonlyArray<string>;
  readonly rpc?: ReadonlyArray<RpcAllowEntry>;
}

export interface NetworkAllowEntry {
  readonly host: string;
  readonly scheme?: 'https' | 'http';
  readonly purpose: string;
}

export interface FsAllowEntry {
  readonly path: string;
  readonly mode: 'read' | 'write';
  readonly purpose: string;
}

export interface RpcAllowEntry {
  readonly method: string;
  readonly purpose: string;
}
```

Rules:

- `ports`: every port the plugin contributes or consumes is listed. The
  host refuses calls through ports outside this set.
- `network`: outbound hosts the plugin may reach. The host's HTTP client
  enforces the allowlist; plugins cannot use raw sockets.
- `signer`: `none` blocks all signer access; `read` allows
  `SignerInfoPort` (the public key surface); `sign` allows
  `SignTransactionPort`. A plugin requesting `sign` triggers a tier-2
  approval prompt the first time the plugin runs.
- `fs`: optional filesystem scopes the plugin may read or write. Paths
  are resolved relative to `${SOLCLI_DATA_DIR}/plugins/<id>/` and may
  not escape that root.
- `env`: optional env vars the plugin may read. Anything outside the
  list reads as undefined.
- `rpc`: optional list of specific RPC methods the plugin may invoke.
  Empty means the plugin uses ports only and does not call raw RPC.

`purpose` fields are required prose strings used in the approval prompt;
they are not parsed by the host but they are surfaced to the user so
the user can make an informed decision.

### Integrity hash format

The integrity hash declared in `solcli.config.toml` (ADR-0012) is the
SHA-384 of the plugin package's tarball, encoded base64. The format
mirrors Subresource Integrity:

```
sha384-BASE64_HASH
```

Verification rules:

- The host computes the SHA-384 of the resolved tarball at load time.
- The hash is compared in constant time (`crypto.timingSafeEqual`).
- A mismatch is `SOLCLI_E_PLUGIN_INTEGRITY` and exits at 77 (permission
  denied; the plugin's integrity claim does not match its content).
- Tier-1 (verified) plugins also check the hash against the registry's
  host-pinned value; a discrepancy is treated as a tier-1 violation and
  the plugin is refused even if the user-listed hash matches.

### Verified-tier registry endpoint

The verified registry is reached over HTTPS at a host-configurable URL
(default: a project-operated endpoint published in the docs). The
contract:

- `GET /v1/plugins/<id>/<version>` returns:

  ```json
  {
    "id": "@example/solcli-plugin-marinade",
    "version": "1.4.0",
    "tarballUrl": "https://...",
    "integrity": "sha384-BASE64",
    "manifest": { "...": "PluginManifest payload" },
    "signedAt": "2026-05-08T00:00:00Z",
    "signer": "release-bot@solcli.dev",
    "signature": "base64"
  }
  ```

- The response is JSON; the signature covers the canonical JSON encoding
  of `id`, `version`, `tarballUrl`, `integrity`, `manifest` and
  `signedAt`.
- The host pins the registry's signing key in
  `packages/platform/src/registry-keys.ts`. A signature failure is
  `SOLCLI_E_PLUGIN_REGISTRY_SIGNATURE` and exits at 77.
- The CLI caches verified-tier registry responses in the cache directory
  with a 24-hour TTL; cache invalidation is manual via
  `solcli plugin refresh <id>`.

The verified registry is opt-in: a user who lists a plugin under tier
2 (community) with an integrity hash skips the registry call entirely.

## Consequences

### Positive

- Plugins declare exactly what they need; users see exactly what they
  approve.
- The integrity format is familiar (Subresource Integrity) and tooling
  to compute it is universal.
- The verified-tier registry is a thin contract; the project can host
  it or hand it off without breaking plugins.
- The `purpose` field forces plugin authors to write down why they
  need each permission, which surfaces in the approval prompt.

### Negative

- Manifest authoring is more work than "just publish a package".
  Mitigated by a `solcli plugin scaffold` helper that emits a starter
  manifest from a plugin's source.
- A verified-tier signer key rotation is a coordinated event. The
  pinned-keys file is a versioned source artifact; key rotations ship
  with a CLI release.

## Alternatives considered

### A. Permissions as a single capability bitmask

Encode permissions as `RW|NET|SIGN` flags. Rejected. Loses the
host-allowlist information (which network destinations, which fs paths,
which env vars) that the prompt needs.

### B. Integrity via SHA-256 in hex

Rejected. SHA-384/base64 matches Subresource Integrity, which is the
existing convention for "verify this resource by hash". SHA-256/hex
would invent a parallel format.

### C. Verified registry as a Git repository

Resolve plugin records by fetching a Git repo. Rejected. Operations
heavy, hard to cache and harder to sign than a JSON endpoint. The Git
approach can be a fallback bootstrap mechanism if the JSON endpoint is
unavailable, documented separately.
