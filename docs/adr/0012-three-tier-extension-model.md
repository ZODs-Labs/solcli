# ADR-0012: Three-tier extension model for plugins

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0010](./0010-capability-manifest-format.md), [ADR-0020](./0020-plugin-permission-manifest-schema.md).

## Context

solcli's reach grows when third parties extend it. A plugin may add a
command (`solcli marinade stake`), contribute a new provider adapter
(another DAS-equivalent), or wire a new signer (an HSM-backed wallet).
The shape of "what is a plugin" is load-bearing because plugins run inside
the same process as the CLI and inherit its credentials.

Two prior arts inform the decision:

- **Hardhat-style declared plugins.** The Hardhat config file
  (`hardhat.config.{ts,js}`) declares a `plugins: [...]` array. Plugins
  are present only if listed; presence is explicit and reproducible.
  Discovery does not depend on the filesystem outside the config.
- **MetaMask-Snaps permission manifest.** Each Snap ships a manifest
  declaring exactly which endowments and permissions it needs. The host
  refuses to load a Snap whose runtime behavior exceeds its declared
  manifest. Trust is bounded by the manifest, not by the code.

solcli takes both. A plugin is loaded only if the project's
`solcli.config.toml` lists it, and a plugin is permitted only what its
permission manifest declares. Three trust tiers describe the chain of
custody that admitted the plugin into the user's environment.

## Decision

### Declared in config (Hardhat-style)

The active config carries a `plugins` array:

```toml
[[plugins]]
id = "@example/solcli-plugin-marinade"
version = "1.4.0"
integrity = "sha384-BASE64..."

[[plugins]]
id = "@org-internal/solcli-plugin-ops"
version = "0.3.2"
path = "./tools/solcli-plugin-ops"
integrity = "sha384-BASE64..."
```

- A plugin not listed in `plugins` is not loaded, even if installed.
- A plugin listed but not present fails fast with
  `SOLCLI_E_PLUGIN_NOT_FOUND` (exit code 78, config error).
- Each plugin entry resolves to a Node ESM package with an exports map
  that points at the plugin's contribution module.

### Permission manifest (Snaps-style)

Every plugin ships a `solcli.plugin.json` permission manifest at its
package root. The full schema lives in ADR-0020 and in
`packages/contracts/src/domain/plugin-manifest.ts`. The host enforces:

- Ports the plugin contributes or consumes are listed in
  `permissions.ports`.
- Network endpoints the plugin may call are listed in
  `permissions.network` (host allowlist of patterns).
- Signer access is one of `permissions.signer: "none"|"read"|"sign"`.
- Filesystem and environment access are listed under `permissions.fs`
  and `permissions.env` respectively.
- Stability tag (ADR-0017) is declared per contributed command.

A plugin that attempts an operation outside its manifest is refused at
the boundary; the host logs `SOLCLI_E_PLUGIN_PERMISSION_DENIED` (exit code 77).

### Trust tiers

| Tier | Source | Integrity required? | Default policy |
|---|---|---|---|
| 1 verified | listed on the verified registry (ADR-0020) | host-pinned hash | load without prompt |
| 2 community | npm or a private registry, listed in `plugins` | SHA-384 integrity required in the config entry | prompt on first load; cache approval per profile |
| 3 local | filesystem path; PATH-discovered fallback | SHA-384 integrity required; PATH discovery requires `--unsafe-path-plugins` | prompt every load; never auto-approved |

- Tier 1 ("verified") matches Hardhat's curated-plugin shape: the host
  knows the hash and the registry record vouches for the plugin.
- Tier 2 ("community") matches the npm-with-integrity pattern; the user
  records the SHA-384 hash in the config and the host refuses to load if
  the hash mismatches.
- Tier 3 ("local") covers in-tree plugins under `./tools/...` and the
  PATH-discovery escape hatch. PATH discovery is opt-in only; without
  `--unsafe-path-plugins` the host ignores PATH-discovered executables
  even when they match the `solcli-plugin-*` name pattern.

### Integrity hash

The integrity field is the SHA-384 hash of the plugin's resolved package
tarball (the same artifact npm would publish), encoded base64. The
choice of SHA-384 and base64 matches Subresource Integrity, so the
format is familiar and tooling (`npm pack && shasum -a 384 ...`) is
already common. The hash is required for tier 2 and tier 3 and ignored
(but accepted) for tier 1 where the registry record carries the host
pin.

## Consequences

### Positive

- Reproducibility: `solcli.config.toml` describes the entire plugin set,
  including versions and hashes. A teammate cloning the repo gets the
  same surface.
- Bounded blast radius: a plugin cannot use the keychain or open
  outbound HTTP unless its manifest declares it.
- Familiar mental model: Hardhat users recognize the config shape;
  MetaMask-Snaps users recognize the permission manifest.
- PATH discovery exists for power users without being the default; one
  flag makes the threat model explicit.

### Negative

- The config grows with the plugin set. Mitigated by the same workflow
  Hardhat uses (one line per plugin).
- Integrity hashes must be updated when a plugin upgrades. Mitigated by
  a `solcli plugin lock` helper that recomputes hashes for the current
  resolved versions.

## Alternatives considered

### A. Auto-discover plugins by name pattern in `node_modules`

Any `solcli-plugin-*` package loads automatically. Rejected. Implicit
loading is the historical source of supply-chain incidents. The user
must list each plugin.

### B. No permission manifest, plugins are trusted code

Rejected. solcli holds API keys and signers; granting unbounded access
to any third-party package is unacceptable.

### C. Cryptographic signatures only, no tiers

Sign every plugin and pin the signing keys. Rejected for v1. Signing
infrastructure adds operational weight that the project does not yet
have; SHA-384 integrity covers the threat model with much less
deployment friction. A signature path can be added later as a fourth
tier or as a refinement of tier 1.
