# Provider Architecture

How solcli organizes external Solana RPC and indexer vendor adapters
(Helius, Triton, future Quicknode, Jito, Hellomoon, Shyft) so the codebase
stays small, evolvable and honest about what each vendor can do.

This document is **load-bearing**. Every CLI command that touches a vendor
should read it. The patterns below are not aspirational; they are the rules
v0.1 implementations must follow.

## 1. Quality attributes (ranked)

For the CLI tier, in priority order:

1. **Correctness**: agents and users pipe outputs into wallets, signing flows,
   and trading bots. A wrong balance or a malformed transaction has real
   financial consequences. Refuse on uncertainty.
2. **Evolvability**: solcli will gain operations and vendors for years. The
   shape of the provider layer determines whether each new vendor is a
   one-folder change or a multi-week refactor.
3. **Operability**: an opaque "provider failed" message wastes a user's day.
   Errors must carry which provider, which operation, why; logs must be
   searchable; capability mismatches must be detectable up front.

Latency, throughput and cost are next-tier concerns. They matter, but for a
short-lived CLI process they rank below the three above.

## 2. Architectural style

Modular monolith with hexagonal layering.

```
┌────────────────────────────────────────────────────────────────────┐
│  apps/cli         commands  ──►  operations  ──►  ports  ──►  ACL  │
│                                                              │     │
│                                                              ▼     │
│  packages/providers     registry  ──►  vendor adapter ───► vendor  │
│                                       (Helius / Triton)     SDK    │
└────────────────────────────────────────────────────────────────────┘
                                                                ▼
                                                       Vendor HTTPS / gRPC
```

* Commands know about **operations** and domain types only.
* Operations compose **ports** through the **registry**.
* Each port has one or more **vendor adapter** implementations. Adapters are
  the **anti-corruption layer** that translates the vendor SDK shape into
  domain types.
* Vendor SDKs are isolated inside their vendor folder. Nothing else imports
  them.

Why this style: command business logic stays vendor-agnostic; adding a vendor
adds one folder; replacing a vendor is a one-line change in `context.ts`;
vendor-specific lock-in is local, visible and auditable.

## 3. The pattern set (in order)

### 3.1 Ports and Adapters (Hexagonal Architecture)

Every operation is its own small port (TypeScript interface). One interface
per operation, not one god-interface with many optional methods.

```ts
// packages/contracts/src/ports/get-portfolio.ts
import type { Pubkey } from "../domain/pubkey.js";
import type { Portfolio } from "../domain/portfolio.js";

export interface GetPortfolioPort {
  getPortfolio(
    owner: Pubkey,
    opts?: { signal?: AbortSignal },
  ): Promise<Portfolio>;
}
```

```ts
// packages/contracts/src/ports/subscribe-signatures.ts
export interface SubscribeSignaturesPort {
  subscribeSignatures(
    filter: SignatureFilter,
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<SignatureNotification>;
}
```

A port has:

- A single method, named for the operation.
- Domain-typed inputs (`Pubkey`, not `string`).
- Domain-typed outputs (`Portfolio`, not `unknown`).
- An `AbortSignal` for cancellation (mandatory per `.claude/rules/typescript/async.md`).
- Optional pagination via a typed cursor structure.

Why ports beat a god-interface (anti-pattern #8 in the architecture skill):

- **Adding an operation is a one-file change** in `packages/contracts/src/ports/`. The contract grows by addition, not modification. (Open-Closed.)
- **A vendor adapter declares which ports it implements via TypeScript itself.** No parallel capability string union to maintain.
- **Each port can have its own input/output evolution** without touching unrelated ones.
- **The registry can dispatch by port-name** without knowing about every operation in the world.

### 3.2 Anti-Corruption Layer (ACL) per vendor

Each vendor adapter folder contains:

```
packages/providers/src/vendors/helius/
├── index.ts              # Manifest + factory + class export
├── client.ts             # Helius-specific HTTP client (auth, base URL)
├── ports/
│   ├── get-portfolio.ts  # ACL: Helius DAS response → domain Portfolio
│   ├── get-assets.ts
│   └── get-priority-fee.ts
├── webhooks/             # Vendor-only operations (NOT domain ports)
│   ├── client.ts
│   └── types.ts
└── README.md
```

The ACL is the per-port file. It accepts domain inputs, calls the vendor SDK
and returns domain outputs. The vendor SDK types **never** leak past this file.

```ts
// packages/providers/src/vendors/helius/ports/get-portfolio.ts
import type { GetPortfolioPort, Portfolio, Pubkey } from "@solcli/contracts";
import type { HeliusClient } from "../client.js";
import { mapHeliusPortfolio } from "./_mapping/portfolio.js";

export function makeHeliusGetPortfolio(client: HeliusClient): GetPortfolioPort {
  return {
    async getPortfolio(owner, opts) {
      const raw = await client.das.getPortfolioRaw(String(owner), {
        signal: opts?.signal,
      });
      return mapHeliusPortfolio(raw);
    },
  };
}
```

Key rules for ACLs:

1. Vendor SDK types stay in the vendor folder. Mapping happens at the port boundary.
2. Each ACL has a unit test asserting domain output for a recorded vendor response (msw fixture).
3. ACL errors map to typed `SolcliError` subclasses (`RpcError`, `ProviderError`, `RateLimitError`) carrying the vendor name.

### 3.3 Capability manifest

A vendor adapter is paired with a **manifest** that names the vendor and
lists the ports it exposes. Manifests power runtime introspection (which
provider can do `getPortfolio`?), `solcli doctor`, and the fallback chain.

```ts
// packages/contracts/src/providers.ts
export type PortName =
  | "getBalance"
  | "getPortfolio"
  | "getAssetsByOwner"
  | "getTokenBalances"
  | "getPriorityFeeEstimate"
  | "getTransaction"
  | "getTransactionHistory"
  | "subscribeSignatures";
// extended as new ports are added in packages/contracts/src/ports/

export interface ProviderManifest {
  readonly name: string;
  readonly version: string;
  readonly ports: ReadonlySet<PortName>;
}

export interface ProviderInstance {
  readonly manifest: ProviderManifest;
  port<P>(name: PortName): P | undefined;
}
```

```ts
// packages/providers/src/vendors/helius/index.ts
import type { GetPortfolioPort, ProviderManifest } from "@solcli/contracts";
import { HeliusClient } from "./client.js";
import { makeHeliusGetPortfolio } from "./ports/get-portfolio.js";

export const HELIUS_MANIFEST: ProviderManifest = {
  name: "helius",
  version: "1",
  ports: new Set([
    "getPortfolio",
    "getAssetsByOwner",
    "getPriorityFeeEstimate",
    "getTransaction",
  ]),
};

export function createHeliusProvider(opts: HeliusOptions) {
  const client = new HeliusClient(opts);
  const ports = new Map<PortName, unknown>([
    ["getPortfolio", makeHeliusGetPortfolio(client)],
    // ... only the ports Helius actually supports
  ]);
  return {
    manifest: HELIUS_MANIFEST,
    port<P>(name: PortName): P | undefined {
      return ports.get(name) as P | undefined;
    },
  };
}
```

Why a manifest beats a `supports()` boolean method:

- The manifest is **a value, not a method**: it can be inspected before the
  provider is even instantiated. `solcli doctor` can list capabilities
  without making a network call.
- The set of ports is **declarative** and trivially testable.
- The manifest can carry future metadata (rate limits, regional endpoints,
  feature flags) without breaking the port surface.

### 3.4 Provider registry (with port-level lookup)

```ts
// packages/contracts/src/providers.ts (continued)
export interface ProviderRegistry {
  register(provider: ProviderInstance): void;
  /** Provider configured as active for the current invocation. */
  active(): ProviderInstance | undefined;
  /** Look up by manifest name. */
  byName(name: string): ProviderInstance | undefined;
  /** All providers that implement the named port, in fallback order. */
  capableFor(name: PortName): readonly ProviderInstance[];
  list(): readonly ProviderInstance[];
}
```

The registry knows which providers are registered and, **for any port**,
which providers can serve it (in fallback order: active first, then
declared fallbacks). It does not know about specific operations; that
knowledge lives in the operation layer.

### 3.5 Operation (application service) layer

Between commands and ports lives the operation layer. One file per operation.
The operation:

1. Resolves a port from the registry (active provider, then fallback).
2. If no provider has the port, attempts a **synthesis** path: compose the
   high-level operation from lower-level ports that the provider does have.
3. Maps `SolcliError` subclasses to consistent, command-agnostic shapes.
4. Logs which provider served the call (for debuggability).

```ts
// apps/cli/src/operations/get-portfolio.ts
import type {
  GetPortfolioPort,
  GetTokenBalancesPort,
  GetBalancePort,
  Pubkey,
  Portfolio,
  ProviderRegistry,
} from "@solcli/contracts";
import type { Logger } from "@solcli/contracts";
import { composePortfolioFromPrimitives } from "./_compose/portfolio.js";

export class getPortfolio operation {
  constructor(
    private readonly deps: {
      registry: ProviderRegistry;
      logger: Logger;
    },
  ) {}

  async execute(
    owner: Pubkey,
    opts: { signal?: AbortSignal; provider?: string } = {},
  ): Promise<Portfolio> {
    const candidates = opts.provider
      ? [this.deps.registry.byName(opts.provider)].filter(Boolean)
      : this.deps.registry.capableFor("getPortfolio");

    for (const provider of candidates) {
      const port = provider?.port<GetPortfolioPort>("getPortfolio");
      if (!port) continue;
      this.deps.logger.debug(
        { provider: provider.manifest.name, op: "getPortfolio" },
        "operation resolved port",
      );
      return port.getPortfolio(owner, opts);
    }

    // Synthesis path: no provider has the high-level port; compose from primitives.
    this.deps.logger.debug({ op: "getPortfolio" }, "no direct port; synthesizing");
    return composePortfolioFromPrimitives(owner, this.deps, opts);
  }
}
```

Why a operation layer (vs commands talking to the registry directly):

- Synthesis logic has one place to live and is unit-testable.
- Commands stay thin (parse args, call operation, format output).
- Cross-cutting concerns (logging, tracing, retries) attach at the operation
  boundary, not scattered across commands.
- A operation is portable: a future HTTP server in front of solcli would
  reuse the same operations.

This is the Application Service layer in DDD parlance, also called Operation
Interactor in Clean Architecture.

### 3.6 Fallback and synthesis policy

A user invocation flows through this resolution order for any operation:

1. **Explicit per-call override** (`--provider helius`): use only that provider; fail if it lacks the port.
2. **Active provider** has the port: use it.
3. **Fallback chain** from config (e.g. `provider.fallback = ["helius", "triton"]`): try each in order.
4. **Synthesis path**: compose from lower-level ports (e.g. `getPortfolio` = `getBalance` + `getTokenBalances` + `getNftsByOwner`).
5. **Fail with `ProviderCapabilityUnsupportedError`** carrying: requested operation, which providers were tried, why each failed.

Synthesis is **opt-in per operation**. Not every high-level operation has a
faithful synthesis; some require the vendor's specialty endpoint (e.g.
Helius DAS search returns ordering that primitive RPC cannot reconstruct).
Operations that don't define a synthesis path simply skip step 4.

When synthesis runs, the user must see a `--verbose` debug line
("synthesized getPortfolio from getBalance + getTokenBalances on triton").
This is operability: surprise behavior is a bug.

### 3.7 Vendor-specific commands (the explicit escape hatch)

Some vendor features have no faithful domain abstraction:

- Helius webhooks management (subscribe to events on-chain).
- Helius enhanced transactions (proprietary parsing schema).
- Triton gRPC stream subscriptions.
- Vendor-specific support utilities.

These get their own command subtree under the vendor name:

```
apps/cli/src/commands/
├── portfolio/              # domain (uses getPortfolio operation)
├── balance/                # domain
├── nft/                    # domain
├── tx/                     # domain
├── helius/                 # vendor escape hatch
│   ├── webhooks/
│   │   ├── create.command.ts
│   │   ├── list.command.ts
│   │   └── delete.command.ts
│   └── das/
│       └── search.command.ts
└── triton/                 # vendor escape hatch
    └── streams/
        └── tail.command.ts
```

Rules for vendor command surfaces:

1. The vendor name must appear in the command path (`solcli helius webhooks list`). Lock-in is visible.
2. Vendor commands import the vendor adapter **directly**: `import { createHeliusProvider } from "@solcli/providers/vendors/helius"` is OK here (and only here).
3. Vendor commands must declare their lock-in in their help text and their `meta.description`.
4. Vendor commands fail loudly if the user has not configured the vendor.

This is the Explicit Boundary pattern: lock-in is not banned; it is **named**.

### 3.8 Configuration shape

```toml
# config.toml
network = "mainnet-beta"

[provider]
active = "helius"
fallback = ["triton"]

[provider.helius]
api_key_secret = "helius.apiKey"   # references @solcli/secrets entry
endpoint = "https://mainnet.helius-rpc.com"

[provider.triton]
api_key_secret = "triton.apiKey"
endpoint = "https://example.triton-one.com/<id>/"
```

`context.ts` reads this config, instantiates each configured provider (lazy:
no network call at instantiation), and registers them with the registry.
A provider is **registered only if its required secret resolves**; missing
secrets fail closed with `SOLCLI_E_CONFIG`, not silent omission.

### 3.9 Failure modes (explicit catalog)

| Failure | How it surfaces | What the user sees |
|---|---|---|
| Active provider lacks the port | Operation falls back; if all candidates lack the port and no synthesis path, throw `ProviderCapabilityUnsupportedError` | `SOLCLI_E_PROVIDER_CAPABILITY_UNSUPPORTED` with provider list |
| Active provider rate-limited | `RpcRateLimitError` raised by ACL with `Retry-After`; operation retries the same provider once with backoff, then falls back | `SOLCLI_E_RPC_RATELIMIT` only if every fallback also rate-limited |
| Active provider 5xx / timeout | ACL retries with jitter (capped); on exhaustion, operation advances to fallback | `SOLCLI_E_RPC_TIMEOUT` only if every fallback also times out |
| Vendor returns malformed payload | ACL fails Zod parse → wraps in `ProviderError`; operation advances to fallback | `SOLCLI_E_PROVIDER` with `vendor` and `expected`/`actual` shape in `details` |
| Vendor API key missing | Provider not registered at startup; operation sees fewer candidates | `solcli doctor` reports the missing secret up front |
| `AbortSignal` raised mid-call | ACL passes signal to fetch / gRPC; vendor SDK throws AbortError; operation re-throws as `AbortError` (exit 130) | `SIGINT` clean exit |
| User passes unknown `--provider name` | Registry `byName` returns `undefined`; operation fails closed | `SOLCLI_E_USAGE` with available provider list |

These map to existing `SOLCLI_E_*` codes in `packages/errors`; no new codes needed.

### 3.10 Observability

Every port call produces (at `debug` level):

```json
{
  "event": "port.invoke",
  "op": "getPortfolio",
  "provider": "helius",
  "durationMs": 412,
  "outcome": "ok",
  "fellBackFrom": null
}
```

Counters (kept in-process, written to file log on flush):

- `provider.<name>.<op>.calls` total
- `provider.<name>.<op>.errors.<code>` total
- `provider.<name>.<op>.duration_ms.p95` (rolling window)
- `provider.<name>.<op>.fallback_in` / `fallback_out` (how often this provider received fallback traffic or sent it onward)

For a CLI, these aggregate over the lifetime of one invocation. A
separate concern in v0.2 is shipping them to Honeycomb / Datadog via an
opt-in `--telemetry` flag; out of scope here.

### 3.11 Plugin extensibility (v0.2 horizon)

The architecture must not preclude third-party adapters:

```
~/.solcli/plugins/
  @quicknode-solcli-provider/
    dist/index.js
    package.json
```

`context.ts` reads `config.toml` `[plugins]` (or scans the directory), loads
each plugin, calls its exported `register(registry)` function which adds a
`ProviderInstance` to the registry. The plugin author depends on
`@solcli/contracts` only, never on `@solcli/providers`.

This works today because the contracts package has the stable surface
(ports, manifest, registry) and never re-exports vendor-specific types.
Nothing else needs to be designed before v0.2; just keep the contracts
package stable.

## 4. File layout (canonical)

```
packages/contracts/src/
├── domain/                          # Branded primitives + result types
│   ├── pubkey.ts                    # Pubkey, MintAddress, OwnerAddress, ProgramId
│   ├── signature.ts                 # Signature, Blockhash
│   ├── amount.ts                    # Lamports, TokenAmount, Sol
│   ├── token.ts                     # TokenMetadata, TokenBalance
│   ├── portfolio.ts                 # Portfolio (composes balances + assets)
│   ├── asset.ts                     # Asset (DAS-shaped, vendor-agnostic)
│   ├── transaction.ts               # Transaction, SignatureNotification
│   └── index.ts
├── ports/                           # One file per port
│   ├── get-balance.ts
│   ├── get-portfolio.ts
│   ├── get-token-balances.ts
│   ├── get-assets-by-owner.ts
│   ├── get-priority-fee-estimate.ts
│   ├── get-transaction.ts
│   ├── get-transaction-history.ts
│   ├── subscribe-signatures.ts
│   └── index.ts                     # exports + PortName union
└── providers.ts                     # ProviderManifest, ProviderInstance, ProviderRegistry

packages/providers/src/
├── registry.ts                      # InMemoryProviderRegistry implements ProviderRegistry
├── manifest.ts                      # Manifest helpers
├── fallback.ts                      # Optional helpers for operation fallback
├── _base/                           # Shared adapter infrastructure
│   ├── http-client.ts               # Wraps undici with retry, timeout, AbortSignal
│   ├── rate-limit.ts                # Token-bucket rate limiter per provider
│   ├── error-mapping.ts             # HTTP / vendor errors → SolcliError subclasses
│   └── zod-helpers.ts               # Schema-validation utilities for ACLs
└── vendors/
    ├── helius/
    │   ├── index.ts                 # Manifest + createHeliusProvider factory
    │   ├── client.ts                # Helius HTTP client (auth, base URL)
    │   ├── ports/
    │   │   ├── get-portfolio.ts     # ACL for Helius DAS
    │   │   ├── get-assets.ts
    │   │   └── get-priority-fee.ts
    │   ├── webhooks/                # Vendor-only operations
    │   │   ├── client.ts
    │   │   └── types.ts
    │   ├── _mapping/                # Vendor-shape → domain-shape
    │   │   ├── portfolio.ts
    │   │   ├── asset.ts
    │   │   └── transaction.ts
    │   └── README.md
    └── triton/
        ├── (same structure)
        └── streams/                 # Triton gRPC streams (vendor-only)
            ├── client.ts
            └── types.ts

apps/cli/src/
├── operations/
│   ├── get-balance.ts
│   ├── get-portfolio.ts
│   ├── get-token-balances.ts
│   ├── _compose/                    # Synthesis helpers
│   │   ├── portfolio.ts             # Compose Portfolio from primitives
│   │   └── README.md
│   └── index.ts                     # registerOperations(deps) factory
├── commands/
│   ├── portfolio/                   # Domain command (uses operations)
│   │   ├── show.command.ts
│   │   └── index.ts
│   ├── balance/
│   ├── helius/                      # Vendor escape hatch
│   │   ├── webhooks/
│   │   │   ├── create.command.ts
│   │   │   ├── list.command.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── triton/
└── context.ts                       # Composition: secrets → providers → registry → operations
```

## 5. Anti-patterns this design avoids

Tagged against the architect-skill anti-pattern list:

| # | Anti-pattern | How this design avoids it |
|---|---|---|
| 8 | God service / chatty API | Ports are one method each. Domain types reduce N+1. |
| 15 | Mixing layers | Vendor SDK types stop at the ACL. Domain types flow upward only. |
| 16 | No schema registry on cross-service streams | Each ACL parses vendor payloads via Zod schemas, kept under `_mapping/` and version-tagged. |
| 17 | Shared mutable global state | Each provider instance is created per-invocation, registered by `context.ts`, discarded at exit. |
| 19 | Logging into the hot path | Port-level observability is debug-only by default; verbose mode opt-in. Pino async transport is non-blocking. |
| 20 | Big-bang rewrite | The migration is incremental: replace the god-interface with ports one operation at a time, vendors adopt new ports as they're built. |

## 6. When to revisit

Revisit this architecture when ANY of these conditions changes:

1. **Plugin authoring becomes a real need** (v0.2+): tighten the contracts
   package's public surface; document the extension contract; provide
   a `solcli plugins` command subtree.
2. **A vendor needs a heavy native binary** (e.g. Triton gRPC requires
   `@triton-one/grpc-client` with platform-specific .so / .dylib):
   the vendor moves from a folder to its own optional peer-dep package.
3. **Two vendor adapters cannot share `_base/`** (different protocol families,
   e.g. WebSocket vs gRPC vs HTTPS-JSON): split `_base/` into protocol-named
   subfolders (`_base/http/`, `_base/grpc/`, `_base/ws/`).
4. **More than five operations need the same synthesis path**: extract a
   `_compose/` library into a separate module within `apps/cli/src/operations/`.

## 7. Migration plan (from current code to this design)

The existing `packages/contracts/src/providers.ts` and `packages/providers/src/`
implement the god-interface variant. v0 is still placeholder; migration is
cheap. Concrete steps:

1. **Add `packages/contracts/src/domain/`** with branded primitives and
   result types. (No breakage; pure additions.)
2. **Add `packages/contracts/src/ports/`** with one file per port. Re-export
   `PortName` union from `packages/contracts/src/providers.ts`.
3. **Add `ProviderManifest` and `ProviderInstance` interfaces** to `providers.ts`.
4. **Keep the existing `DataProvider` god-interface deprecated** with a
   JSDoc `@deprecated use ProviderInstance + ports`. Schedule removal at
   v0.2.
5. **Refactor `InMemoryProviderRegistry`** to expose `capableFor(port)`
   alongside the existing `active()` / `byName()` (additive).
6. **Refactor `FallbackChain`** into a operation-layer helper, not a
   `DataProvider`. The operation decides per-call fallback, not the registry.
7. **Add `apps/cli/src/operations/`** with one file per operation, registered
   by `context.ts`.
8. **First vendor implementation (Helius)** uses ports only; the legacy
   `DataProvider` god-interface is never touched in vendor code.
9. **Delete the god-interface and `FallbackChain` class** at v0.2 once all
   operations are port-based.

Migrate incrementally: build the new shape alongside, route new code
through it, retire the old shape when usage drops to zero.

## 8. Packaging note (vendor folders, not packages)

First-party vendor adapters live as folders inside `@solcli/providers/src/vendors/<vendor>/`,
not as separate workspace packages. The criteria for splitting a vendor into
its own package are listed in §6.

