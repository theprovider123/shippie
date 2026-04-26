#!/usr/bin/env bash
# Wrapper for scripts/mirror-pg-to-d1.ts that loads DATABASE_URL from
# apps/web/.env.local and executes the mirror.
#
# Usage:
#   bash scripts/run-mirror.sh           # real run
#   bash scripts/run-mirror.sh --dry-run # preview only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PLATFORM_DIR/../web/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Read DATABASE_URL line, strip the prefix + leading/trailing quotes.
RAW=$(grep '^DATABASE_URL=' "$ENV_FILE" || true)
if [[ -z "$RAW" ]]; then
  echo "error: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi
VAL="${RAW#DATABASE_URL=}"
VAL="${VAL%\"}"
VAL="${VAL#\"}"
export DATABASE_URL="$VAL"

if [[ -z "$DATABASE_URL" ]]; then
  echo "error: DATABASE_URL parsed empty" >&2
  exit 1
fi

echo "[run-mirror] DATABASE_URL loaded (host: $(echo "$DATABASE_URL" | sed -E 's|^postgres(ql)?://[^@]*@([^/:]+).*|\2|'))"
cd "$PLATFORM_DIR"
exec bun run scripts/mirror-pg-to-d1.ts "$@"
