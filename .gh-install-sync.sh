#!/usr/bin/env bash
# Throwaway: mirror every GitHub App installation into github_installations
# for the admin user. Lets us skip the browser redirect loop during dev.
#
# Safe to delete after it succeeds.
set -euo pipefail

cd "$(dirname "$0")"

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

APP_ID=$(grep '^GITHUB_APP_ID=' apps/web/.env.local | sed 's/^GITHUB_APP_ID="\(.*\)"$/\1/')
KEY_B64=$(grep '^GITHUB_APP_PRIVATE_KEY=' apps/web/.env.local | sed 's/^GITHUB_APP_PRIVATE_KEY="\(.*\)"$/\1/')
ADMIN_EMAIL=$(grep '^ADMIN_EMAILS=' apps/web/.env.local | sed 's/^ADMIN_EMAILS="\(.*\)"$/\1/' | cut -d, -f1)

echo "[sync] App ID: $APP_ID"
echo "[sync] Admin: $ADMIN_EMAIL"

echo "$KEY_B64" | base64 -d > "$TMP"

# Build an App JWT — same recipe as apps/web/lib/github/app.ts
NOW=$(date +%s); IAT=$((NOW-60)); EXP=$((NOW+540))
b64url() { base64 | tr -d '=\n' | tr '/+' '_-'; }
HDR=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
PAY=$(printf '{"iss":"%s","iat":%s,"exp":%s}' "$APP_ID" "$IAT" "$EXP" | b64url)
SIG=$(printf '%s.%s' "$HDR" "$PAY" | openssl dgst -sha256 -sign "$TMP" -binary | b64url)
JWT="$HDR.$PAY.$SIG"

# Look up the admin user's UUID (they must be signed in / have a user row).
USER_ID=$(psql -d shippie_dev -At -c \
  "select id from users where email = '$ADMIN_EMAIL' limit 1;")
if [ -z "$USER_ID" ]; then
  echo "[sync] No user row for $ADMIN_EMAIL. Sign in at /auth/signin first."
  exit 1
fi
echo "[sync] User ID: $USER_ID"

# Pull all installations for this GitHub App.
INSTALLS=$(curl -sS \
  -H "Authorization: Bearer $JWT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/app/installations)

COUNT=$(printf '%s' "$INSTALLS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "[sync] Installations on GitHub: $COUNT"

if [ "$COUNT" = "0" ]; then
  echo "[sync] Nothing to sync. Install the app at github.com/apps/shippie-deploy first."
  exit 0
fi

# For each installation, upsert a row.
printf '%s' "$INSTALLS" | python3 -c "
import sys, json
print(json.dumps([{'id': i['id'], 'login': i['account']['login'], 'type': i['account']['type'], 'selection': i['repository_selection']} for i in json.load(sys.stdin)]))
" > /tmp/installs.json

python3 - <<PY
import json, subprocess
rows = json.load(open('/tmp/installs.json'))
for r in rows:
    sql = f"""insert into github_installations
        (github_installation_id, user_id, account_login, account_type, repository_selection)
      values ({r['id']}, '$USER_ID', '{r['login']}', '{r['type']}', '{r['selection']}')
      on conflict (github_installation_id) do update set
        user_id = excluded.user_id,
        account_login = excluded.account_login,
        repository_selection = excluded.repository_selection,
        updated_at = now();"""
    subprocess.run(['psql', '-d', 'shippie_dev', '-c', sql], check=True)
    print(f"  ✓ upserted install {r['id']} (@{r['login']}, {r['selection']} repos)")
PY

rm -f /tmp/installs.json

echo
echo "[sync] Done. Open:"
printf '%s' "$INSTALLS" | python3 -c "
import sys, json
for i in json.load(sys.stdin):
    print(f'  http://localhost:4100/new?source=github&installation_id={i[\"id\"]}')
"
