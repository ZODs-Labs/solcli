# ADR-0018: Agent mode and the fd 3 stream

**Status:** Accepted (2026-05-11).
**Decider:** ZODs Labs (soleng001).
**Relates to:** [ADR-0011](./0011-mcp-bridge-inside-binary.md), [ADR-0014](./0014-ndjson-events-channel.md).

## Context

A pipeline-friendly CLI keeps stdout for command result data and stderr
for logs (see `cli.md`). The NDJSON events channel (ADR-0014) introduces
a third stream. When an agent runs `solcli` directly (not through the
MCP server from ADR-0011), the agent benefits from having all three
streams open simultaneously: the JSON result on stdout, the operator
log on stderr and the per-stage events somewhere else.

Unix has a clean answer: a third file descriptor. fd 3 is conventional
for "an extra channel the parent opens before exec" and is well-supported
by every runner that already invokes subprocesses through `posix_spawn`
(Node `child_process.spawn`, Python `subprocess`, Go `exec.Cmd`).

The decision is to make this convention explicit and discoverable: an
`SOLCLI_AGENT_MODE=1` env var or `--agent-mode` flag turns on the fd 3
event sink. The mode is also the right place to choose machine-friendly
defaults for output mode and color.

## Decision

### Activation

Agent mode is active when either of:

- `SOLCLI_AGENT_MODE=1` is set in the environment.
- `--agent-mode` is on the command line.

When active:

- The events channel (ADR-0014) is sunk to fd 3 unless overridden by
  `--events <path>` or `--events ndjson`.
- The default output mode is `json` (this matches the existing TTY rule;
  agent mode strengthens it by ignoring `isTTY`).
- Color is disabled regardless of TTY detection.
- Interactive prompts are refused with
  `SOLCLI_E_INTERACTIVE_REQUIRED` and exit code 78; the user-facing
  message names the env var or flag that would have supplied the
  missing input.

### fd 3 contract

The events sink writes NDJSON lines to fd 3 when agent mode is active.
The parent process is expected to open fd 3 before `exec`. Node and
POSIX equivalents:

```js
spawn('solcli', argv, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
// channel index 3 is fd 3
```

If fd 3 is not open at solcli startup:

- The events sink falls back to `/dev/null` (per ADR-0014's advisory
  semantics).
- A debug log records `SOLCLI_E_EVENT_SINK_UNAVAILABLE`.
- The command runs to completion; agent mode does not require fd 3 to
  be open. A runner that does not consume events still gets a working
  CLI.

### stdout and stderr unchanged

Agent mode does NOT change the stdout/stderr contract:

- stdout: command result data, exactly as documented for non-agent
  invocations. JSON by default in agent mode.
- stderr: pino-formatted logs, exactly as documented.
- fd 3: NDJSON events, when fd 3 is open.

The three streams are independent. A consumer that closes fd 3 still
gets a working stdout/stderr pair.

### Exit codes

Agent mode introduces **no new exit codes**. The frozen exit-code set
(0, 1, 2, 64, 65, 69, 70, 73, 75, 77, 78, 130 and 143) is sufficient
for every agent-mode failure path. Interactive-required failures map to
78, sink-unavailable conditions are advisory and do not affect the exit
code at all.

### Discoverability

`solcli --agent-mode --help` documents the fd 3 contract and points to
the NDJSON event schema (ADR-0014). The runtime manifest (ADR-0010)
records the events the running CLI version supports so an agent can
adapt to the running binary.

## Consequences

### Positive

- Agents get three clean streams without inventing a custom framing.
- The mode is one flag away; no environment surgery beyond `SOLCLI_AGENT_MODE=1`.
- Runners that do not consume events still work; the fd 3 sink is
  advisory.
- The exit code surface stays frozen; no new mappings to track.

### Negative

- fd 3 is unfamiliar to some users. Mitigated by documentation and by
  the `--events ndjson` alternative that puts events on stdout for
  hand-driven debugging.
- Spawning solcli through a shell wrapper that does not preserve fd 3
  silently loses events. Mitigated by the advisory semantics; the
  command still works, only the observability is degraded.

## Alternatives considered

### A. Events on stderr in agent mode

Use stderr for both logs and events. Rejected. Mixing typed and free-form
streams breaks the events parser and forces a tag prefix that does not
exist elsewhere in the contract.

### B. Open a Unix domain socket per invocation

Spin up a per-run socket; the runner connects to it. Rejected. Heavy
ceremony for what a file descriptor solves; portability is worse
(Windows handling of AF_UNIX is recent and uneven).

### C. Always-on fd 3, no agent-mode flag

fd 3 is the events sink whenever fd 3 is open. Rejected. Surprising
behavior for a user who happens to spawn solcli with `stdio: 'inherit'`
from a parent that already has fd 3 open for a different purpose. The
mode-gate keeps the behavior explicit.
