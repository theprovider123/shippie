# `apps/platform/scripts`

One-shot tooling that runs outside the SvelteKit Worker. The mirror script
copies the legacy Neon/Postgres database into the new D1 database before
the SvelteKit platform takes over.

## `mirror-pg-to-d1.ts`

Copies every table from the Neon database identified by `DATABASE_URL`
into the remote D1 database (`shippie-platform-d1`). Uses
`INSERT OR REPLACE`, so re-runs upsert by primary key.

### Prerequisites

1. **`DATABASE_URL` env var** points at the legacy Neon Postgres database
   (read access is enough — script never writes back).
2. **`wrangler` is authenticated** for the Cloudflare account that owns
   `shippie-platform-d1` (`bunx wrangler whoami` should print the right
   email + account ID).
3. **D1 migrations applied** — confirm with:
   ```bash
   bunx wrangler d1 migrations list shippie-platform-d1 --remote
   ```
   Expect to see `0001_init.sql` and `0002_full_schema.sql` listed as
   already applied.

### Dry run

The dry-run path streams rows from Postgres but does NOT call out to D1.
It prints one preview INSERT per table so you can sanity-check the
shape:

```bash
DATABASE_URL=postgres://USER:PASS@HOST/db \
  bun run scripts/mirror-pg-to-d1.ts --dry-run
```

Look for:
- `[mirror] users: dry-run preview\nINSERT OR REPLACE INTO "users" …`
- Per-table totals at the end, e.g. `[mirror] users: 47/47 ✓`.

### Real run

Drop the flag:

```bash
DATABASE_URL=postgres://USER:PASS@HOST/db \
  bun run scripts/mirror-pg-to-d1.ts
```

Each batch becomes one `wrangler d1 execute --remote --command="..."`
subprocess. That's slow at scale (one round-trip per ~100 rows) but
predictable and avoids needing a CF API token on the dev box.

#### Single-table

```bash
DATABASE_URL=… bun run scripts/mirror-pg-to-d1.ts --table=users,apps
```

### Verifying

After the run, compare row counts between Postgres and D1:

```bash
# Postgres side
psql "$DATABASE_URL" -c "SELECT count(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM apps;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM deploys;"

# D1 side
bunx wrangler d1 execute shippie-platform-d1 --remote \
  --command "SELECT count(*) FROM users;"
bunx wrangler d1 execute shippie-platform-d1 --remote \
  --command "SELECT count(*) FROM apps;"
bunx wrangler d1 execute shippie-platform-d1 --remote \
  --command "SELECT count(*) FROM deploys;"
```

Numbers should match (or D1 should be ≤ Postgres by exactly the
filtered-out `app_events` rows older than 60 days).

### Tunables (env vars)

| Var | Default | Purpose |
|---|---|---|
| `PAGE_SIZE` | `1000` | Rows fetched per Postgres page |
| `BATCH_SIZE` | `100` | Rows per D1 INSERT statement |
| `D1_DB_NAME` | `shippie-platform-d1` | Override for canary DBs |

### Caveats

- **`app_events` is filtered to last 60 days.** The retention cron in
  D1 (`DELETE FROM app_events WHERE ts < datetime('now', '-60 days')`)
  drops anything older anyway.
- **No transactional consistency between tables.** Mirror runs
  table-by-table; if writes are happening on the Postgres side mid-run
  the result is "row-consistent per table" but not snapshot-consistent
  across tables. Since `apps/web/` is no longer serving traffic the
  Postgres database should be quiescent during the mirror.
- **Polymorphic refs (`store_account_credentials.subject_id`) are
  passed through verbatim.** They reference either `users.id` or
  `organizations.id` depending on `subject_type`; SQLite has no
  polymorphic FK either, so the contract carries.
- **Bigint columns** (e.g. `app_events.id`, `deploy_artifacts.total_bytes`)
  are emitted as plain integers in SQL literals. D1 `INTEGER` is 64-bit
  so the round-trip is lossless.
- **Postgres `text[]` columns become JSON-typed text** in SQLite (e.g.
  `apps.screenshot_urls`). Drizzle's `text(..., { mode: 'json' })`
  handles parse/stringify on read/write.
- **Soft-deleted rows are mirrored unchanged.** Filtering happens at
  read time in app code.

### One-shot, not dual-write

This script is designed for the cutover scenario where Postgres becomes
read-only after the mirror completes. It does NOT keep D1 in sync with
ongoing Postgres writes. The plan ships dual-write infrastructure
elsewhere if needed; in our case `apps/web/` is already not serving
traffic, so the mirror is a one-shot operation.

## `mirror-tables.ts`

Per-table column manifest with type hints. Edit when the schema changes.

## `mirror-transforms.ts`

Pure transformation helpers — `transformValue`, `transformRow`,
`sqlLiteral`, `buildInsertSql`. Unit-tested in
`mirror-transforms.test.ts`.

## Tests

```bash
cd apps/platform
bun test scripts/mirror-transforms.test.ts
```

## GitHub Actions secrets — `shippie-build.yml`

The build workflow (`.github/workflows/shippie-build.yml`) clones a
maker's repo and uploads the artifact to R2. To support **private**
maker repos it mints a short-lived installation token at workflow run
time via `actions/create-github-app-token@v2`. That action needs two
repo secrets to be set on `theprovider123/shippie`:

| Secret | Value |
|---|---|
| `GH_APP_ID` | The Shippie GitHub App's numeric App ID |
| `GH_APP_PRIVATE_KEY` | The Shippie GitHub App's PEM private key (raw multi-line PEM, including `-----BEGIN/END PRIVATE KEY-----` lines) |

These are the **same credentials** as the wrangler secrets
`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` that the platform Worker
uses, but they must be set separately in GitHub's secret store —
GitHub Actions cannot read Cloudflare wrangler secrets.

### One-time setup

Make sure `gh` is authenticated as someone with admin rights on the
repo, then:

```bash
# Numeric App ID — single line
gh secret set GH_APP_ID -R theprovider123/shippie --body '123456'

# Private key — multi-line PEM via stdin
cat path/to/shippie-app.private-key.pem \
  | gh secret set GH_APP_PRIVATE_KEY -R theprovider123/shippie
```

`gh secret set` reads from stdin when `--body` is omitted, which is the
correct path for multi-line PEM values. Do not paste the PEM into a
shell argument — newlines inside `--body 'xxx'` get mangled.

### Verifying

```bash
gh secret list -R theprovider123/shippie | grep -E 'GH_APP_(ID|PRIVATE_KEY)'
```

Both names should appear with a recent `Updated` timestamp. The values
themselves are never readable back via the API.

### Why two secret stores?

| Need | Stored as | Consumer |
|---|---|---|
| Worker dispatches the workflow + reads installation metadata | `wrangler secret put GITHUB_APP_ID …` on `shippie-platform` | `apps/platform` Worker |
| Workflow mints clone token at runtime | `gh secret set GH_APP_ID …` on `theprovider123/shippie` | `actions/create-github-app-token@v2` step in `shippie-build.yml` |

Both reference the same GitHub App. Rotating the private key requires
updating it in **both** secret stores.

### Public-repo deploys still work

When the platform dispatches a build for a maker who has not installed
the Shippie GitHub App, the `installation_id` workflow input is
empty. The workflow skips the token-mint step (`if: ${{ inputs.installation_id != '' }}`)
and falls back to an anonymous clone — same behaviour as before this
change.
