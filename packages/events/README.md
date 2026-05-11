# @solcli/events

NDJSON events channel for solcli (ADR-0014, ADR-0018). Each event record is
serialized to a single JSON object terminated by `\n` and written through a
pluggable sink. Four sink kinds are supported: `stdout` for hand-driven
debugging via `--events ndjson`, `fd3` for agent-mode runners that open file
descriptor 3 before exec, `file` for CI audit logs (append-only, mode `0o600`
on POSIX, writes serialized through an internal queue) and `devnull` as the
advisory fallback when no events sink is configured or fd 3 is closed.

The writer is EPIPE-tolerant: a broken downstream pipe drops the event with a
debug log entry rather than aborting the command. Every record passes through
the redactor before it hits the sink, replacing allowlisted secret fields and
base58 strings of length 32 or greater with stable placeholders.
