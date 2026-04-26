#!/usr/bin/env bash
# Reads a value from apps/web/.env.local and uploads it as a Cloudflare
# secret to the shippie-platform Worker — never prints the value, never
# writes it to disk anywhere.
#
# Usage: bash scripts/set-secret-from-env.sh ENV_VAR_NAME [WRANGLER_SECRET_NAME]
#   If WRANGLER_SECRET_NAME is omitted, defaults to ENV_VAR_NAME.
#
# Examples:
#   bash scripts/set-secret-from-env.sh RESEND_API_KEY
#   bash scripts/set-secret-from-env.sh GITHUB_APP_PRIVATE_KEY GITHUB_PRIVATE_KEY

set -euo pipefail

ENV_NAME="${1:-}"
SECRET_NAME="${2:-$ENV_NAME}"

if [[ -z "$ENV_NAME" ]]; then
  echo "usage: $0 ENV_VAR_NAME [WRANGLER_SECRET_NAME]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PLATFORM_DIR/../web/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Extract value, strip surrounding quotes if present.
RAW=$(grep "^${ENV_NAME}=" "$ENV_FILE" || true)
if [[ -z "$RAW" ]]; then
  echo "error: ${ENV_NAME} not set in $ENV_FILE" >&2
  exit 1
fi
VAL="${RAW#${ENV_NAME}=}"
VAL="${VAL%\"}"
VAL="${VAL#\"}"

if [[ -z "$VAL" ]]; then
  echo "error: ${ENV_NAME} parsed empty" >&2
  exit 1
fi

echo "[setup] uploading $SECRET_NAME (value length: ${#VAL} chars) to shippie-platform"
cd "$PLATFORM_DIR"
echo -n "$VAL" | bunx wrangler secret put "$SECRET_NAME"
