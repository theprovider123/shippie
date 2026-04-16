#!/usr/bin/env bash
# `bun run db:push` wrapper that sources DATABASE_URL from apps/web/.env.local
# if the environment doesn't already set one. Prevents the "oops, migrations
# landed in .pglite instead of your real dev DB" foot-gun.
set -e

cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ] && [ -f apps/web/.env.local ]; then
  DATABASE_URL=$(awk -F'=' '
    /^DATABASE_URL=/ {
      sub(/^DATABASE_URL=/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }' apps/web/.env.local)
  export DATABASE_URL
fi

if [ -n "$DATABASE_URL" ]; then
  echo "[db-push] DATABASE_URL: ${DATABASE_URL%%\?*}"  # strip query string if any
fi

cd packages/db
exec bun run db:push
