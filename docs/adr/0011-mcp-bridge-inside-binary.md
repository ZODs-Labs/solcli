# ADR-0011: MCP bridge inside the binary

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0010](./0010-capability-manifest-format.md), [ADR-0014](./0014-ndjson-events-channel.md), [ADR-0018](./0018-agent-mode-fd-3-stream.md), [ADR-0019](./0019-sidecar-mcp-daemon-optional.md).

## Context

AI agents increasingly invoke CLIs through the Model Context Protocol
(MCP). Without an MCP surface, an agent must spawn `solcli` once per
operation, parse the human help text and recover error semantics from
exit codes alone. With an MCP surface, the agent gets a structured tool
catalogue, validated arguments, streaming outputs and the same intent
envelope the human pipeline already uses.

There are two architectural choices: ship the MCP bridge inside the
solcli binary as a subcommand, or ship it as a separate sidecar daemon.
The sidecar shape is documented as a deferred option (ADR-0019); v1
chooses the inside-the-binary shape because:

- Distribution stays single-binary; `npm i -g solcli` is the only install
  step.
- The bridge sees the same composition root the CLI uses; there is no
  drift between "what the human ran" and "what the agent ran".
- Output isolation (stdout vs stderr vs events) reuses the contract
  defined in `cli.md` rather than reinventing it.

The MCP protocol mandates that the transport's framing channel is the
process's stdout. solcli's stdout contract (from `cli.md`) reserves
stdout for command result data. The two rules combine into a strict
discipline: when `solcli mcp serve` is the running command, stdout is
exclusively MCP framed JSON-RPC and nothing else; every captured tool
output flows through the response envelope, not the raw stdout stream.

## Decision

A subcommand `solcli mcp serve` is the canonical MCP server.

### Transport

- v1 transport is **stdio only**. The server reads MCP framed JSON-RPC
  from stdin and writes responses to stdout.
- HTTP+SSE transport is **deferred**. It will land in a later ADR when a
  concrete use case appears that stdio cannot serve (multi-client share,
  long-lived hosted agent runs). ADR-0019 documents the sidecar path that
  would carry HTTP+SSE.

### Output isolation

- **stdout** carries MCP framed JSON-RPC only. No human text, no logs,
  no banners, no progress.
- **stderr** carries pino-formatted logs (per `logging.md`) and any
  fatal-path output.
- **Tool outputs** (the bytes a command would have written to stdout in
  normal mode) are captured by a sink and placed inside the MCP response.
  The sink also captures the NDJSON events channel (ADR-0014) and
  forwards each event as an MCP notification so streaming consumers get
  per-stage progress.

### Dispatch

- Tool listings come from the runtime manifest (ADR-0010). Each tool's
  input schema is the manifest's `argsSchema`.
- A tool call constructs an argv vector from the validated arguments and
  dispatches through the same command runner the CLI uses. The runner
  is parameterized by output sinks; in MCP mode the sinks point at the
  capture buffer.
- The capture buffer is per-call and bounded. Output that would overflow
  is truncated and the truncation is reported in the response's `meta`.
- The intent envelope (ADR-0008, ADR-0013) is built exactly as in human
  mode; safety gates apply unchanged. There is no MCP-mode override that
  weakens a gate.

### Lifecycle

- `solcli mcp serve` runs until stdin closes or `SIGTERM` arrives.
- Multiple concurrent tool calls are allowed; the runner uses the
  existing concurrency limiter (see `async.md`). The default cap is the
  same per-provider 10-concurrency cap; the MCP server does not raise it.

## Consequences

### Positive

- One binary, one composition root, one output contract. The human CLI
  and the agent MCP surface cannot drift apart because they are the same
  command runner.
- The runtime manifest (ADR-0010) is the single source of truth for tool
  catalogue; adding a command does not require any MCP-specific
  bookkeeping.
- Safety gates and the events channel work in agent mode by construction.

### Negative

- Long-lived MCP sessions hold a node process for the lifetime of the
  session. For multi-tenant agent runs this is suboptimal; ADR-0019
  documents the sidecar daemon as the planned escape hatch.
- The capture buffer adds a write hop for tool output. The overhead is
  small relative to the network calls the tool itself performs.

## Alternatives considered

### A. Standalone sidecar daemon as v1

`solcli-mcp` ships as a separate binary. Rejected for v1. Doubles the
distribution surface; risks drift between sidecar's view of the
manifest and the CLI's view. Documented as the deferred path in
ADR-0019.

### B. MCP over HTTP from the first release

Run an HTTP+SSE server with multi-client support. Rejected for v1. Most
agent runners launch the MCP server as a subprocess and speak stdio;
HTTP adds attack surface, port-allocation pain and TLS configuration that
v1 does not need.

### C. Embed the MCP server in every command

Each command optionally responds to MCP framing on stdin. Rejected.
Bloats every command, makes the stdout contract per-command instead of
per-invocation and prevents a clean "list all tools" entry point.
