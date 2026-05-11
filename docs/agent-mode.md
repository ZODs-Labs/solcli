# Agent Mode (JSON / NDJSON / Non-Interactive)

solcli is designed for both humans and automation. Every command supports an
automation-friendly invocation profile.

## Recommended invocation

```bash
solcli <command> --output json --no-input
```

When piping stdout (which automation often does), TTY detection alone disables
color, spinners and prompts. `--no-input` makes the contract explicit and
refuses to spin even if a future TTY-detection edge case fails.

## JSON envelope

Success:

```json
{ "schemaVersion": 1, "data": { ... } }
```

Error (when emitted on the JSON output path):

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "SOLCLI_E_X",
    "message": "human readable",
    "exitCode": 11,
    "details": { ... },
    "cause": null
  }
}
```

## NDJSON streaming

```bash
solcli <command> --output ndjson
```

Each record is a JSON object on its own line, terminated with LF (`\n`).
NDJSON makes pagination and streaming responses trivial to consume:

```bash
solcli plugin example demo --output ndjson --mode stream --count 100 | while read -r line; do
  echo "$line" | jq .i
done
```

## Exit codes

See `solcli help exit-codes` or `docs/exit-codes.md`.

## BigInt and Date

- `bigint` is serialized as a string in JSON output. Consumers must parse to
  bigint themselves when precision matters (most Solana values fit in `Number`
  but lamports for large balances can exceed `2^53 - 1`).
- `Date` is serialized as an ISO 8601 string.

## Pagination

List commands (v1) emit a `cursor` field at the end of the response. To fetch
the next page, pass `--cursor <opaque>`.

## CI integration

```yaml
- name: Read on-chain config
  run: solcli --output json some-read-command
  env:
    NO_UPDATE_NOTIFIER: "1"
    SOLCLI_MASTER_KEY: ${{ secrets.SOLCLI_MASTER_KEY }}
```
