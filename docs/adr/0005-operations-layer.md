# ADR-0005: Operations layer between commands and ports

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0001](./0001-hexagonal-provider-architecture.md), [ADR-0006](./0006-capability-manifest.md).

## Context

Commands are thin: parse args, validate, emit output. They should not know
about provider fallback, capability checks, synthesis from primitives,
retries or logging boilerplate. If commands knew those concerns directly,
each command would re-implement them and drift.

Three places this logic could live:

1. **Inside the registry** (registry decides fallback per call). Couples policy to mechanism; hard to test in isolation.
2. **Inside each port adapter** (vendor adapter wraps itself in fallback). Vendor-specific code knowing about other vendors is a layering violation.
3. **In a dedicated operations layer** between commands and the registry.

## Decision

Add an **operations layer** at `apps/cli/src/operations/`. One file per
operation. Each operation is a small function (no class, no inheritance,
no factory):

```ts
export async function getPortfolio(
  deps: OperationDeps,
  owner: OwnerAddress,
  opts: OperationInvokeOptions = {},
): Promise<Portfolio> {
  const { port, provider } = resolvePort(deps.registry, "getPortfolio", opts.provider);
  deps.logger.debug({ provider: provider.manifest.name, op: "getPortfolio" }, "operation resolved");
  return port.getPortfolio(owner, opts.signal ? { signal: opts.signal } : undefined);
}
```

A small `createOperations(deps)` factory binds the operations to the
runtime context and exposes them as `ctx.ops.<operation>`:

```ts
const portfolio = await ctx.ops.getPortfolio(owner, { signal });
```

Each operation:

- Resolves the right port (explicit `--provider`, then active, then fallback).
- Logs which provider served the call at debug level.
- Propagates `AbortSignal`.
- Optionally composes a synthesis path from primitive ports when no
  provider has the high-level port directly.
- Throws typed `SolcliError` subclasses with stable codes.

## Consequences

### Positive

- Commands stay thin and consistent. Refactors to fallback policy do not touch commands.
- Each operation has a unit test that exercises all resolution paths.
- Logging convention is centralized; one place to add OpenTelemetry spans when v0.2 ships telemetry.
- The operation set is portable: a future programmatic API (HTTP, gRPC) can reuse it without spawning the CLI.
- Function-based, no class machinery; one operation per file maps 1:1 to one port.

### Negative

- One more layer. Each operation has three artifacts: port interface, ACL implementation, operation function. Acceptable: each has one responsibility.
- Operations must be wired in `context.ts`. Solved by `createOperations(deps)` returning the full set.

## Rules

1. Commands do NOT talk to the registry directly. They call `ctx.ops.<operation>(...)`.
2. Operations do NOT know about specific vendors. They know about ports.
3. Operations are pure of side effects beyond logging. No file I/O, no caching. Caching belongs to the cache layer or the ACL.
4. Synthesis paths are explicit. An operation either composes from primitives or it fails closed. Implicit fallback to surprise synthesis is not allowed.
5. Logging is debug-level by default. Verbose mode shows the resolution path; quiet mode never emits operation telemetry.

## Alternatives considered

### A. Register fallback policy on the registry

`registry.active()` returns a synthetic provider that wraps the fallback chain. Rejected:

- Fallback is per-operation, not per-provider. Different operations may need different fallback orders.
- Synthesis paths combine multiple primitive ports; a single "synthetic provider" cannot express that cleanly.
- Coupling policy (which fallback) to mechanism (the registry) makes both harder to test.

### B. Put fallback logic in each command

Rejected: duplicates the policy across N commands; drifts; no central place for telemetry.

### C. Skip the operations layer; commands call the registry directly

Rejected: commands then carry resolution boilerplate; cross-cutting concerns (logging, tracing) scatter; a future programmatic API has no operations to reuse.

### D. Class-per-operation (e.g. `GetPortfolioOperation`)

Rejected as initial proposal. Each operation has no state across calls; a class with one method and a `deps` constructor field is the same shape as a function with `deps` injected. The function is simpler at the call site and in tests.
