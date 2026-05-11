#!/usr/bin/env bash
# Local-dev wrapper: loads .env (HELIUS_API_KEY, etc.) and invokes the built CLI.
#
# Usage: solcli-dev [args...]
#
# Auto-rebuilds when src/ has changed since the dist/ bundle was last written
# (skip with SOLCLI_DEV_NOBUILD=1).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$REPO_ROOT/apps/cli/dist/bin/solcli.js"
ENV_FILE="$REPO_ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

needs_build=0
if [[ ! -f "$BIN" ]]; then
  needs_build=1
elif [[ "${SOLCLI_DEV_NOBUILD:-0}" != "1" ]]; then
  newest_src="$(find "$REPO_ROOT/apps/cli/src" "$REPO_ROOT/apps/cli/bin" "$REPO_ROOT/packages" -name '*.ts' -newer "$BIN" -print -quit 2>/dev/null || true)"
  if [[ -n "$newest_src" ]]; then needs_build=1; fi
fi

if [[ "$needs_build" -eq 1 ]]; then
  echo "[solcli-dev] rebuilding (set SOLCLI_DEV_NOBUILD=1 to skip)" >&2
  (cd "$REPO_ROOT" && pnpm --filter solcli build >&2)
fi

exec node "$BIN" "$@"
