# The Cannon — the Arsenal matchday companion

A flagship Shippie showcase: local-first, offline-capable, live when online,
anonymous by default. Four tabs — **Now**, **Matches**, **Terrace**, **Squad** —
over a matchday state machine (`idle → pre → live → ht → ft`).

## How data flows

| Layer | What | Where |
|---|---|---|
| Feed Protocol | fixtures, match-live, squad, news, club | `app_feeds` (D1), `GET /api/apps/cannon/feeds/<feed>` |
| Community API | takes, votes, reports, gauge, predictions | `cannon_*` tables, `/api/cannon/*` |
| Local cache | last-good feed envelopes + queued writes | `localStorage` (SDK `shippie:feed:cannon:*`, `cannon_*` keys) |
| Bundled seed | `src/season/*.json` | baked into the build — the offline floor |

Every screen shows provenance: a dashed "as of …" badge appears whenever the
data on screen is past its `staleAfter` or is running on the bundled seed.
No number is ever fabricated — empty gauges and predictions say so.

## Updating the app week to week (the runbook)

1. **Edit the JSON** in `src/season/`:
   - `fixtures.json` — fixtures (UTC kickoffs!), TV channels, difficulty, H2H.
   - `match.json` — only needed for manual matchday control; set `"lock": true`
     to stop the cron's schedule machine overwriting your copy.
   - `squad.json` — availability (`fit|doubt|injured|suspended`) + notes.
   - `news.json` — **summaries in your own words** + link out. Never paste
     article text; the server validator and the publish script both insist.
   - `club.json` — trophies, this-day entries (`"MM-DD"` keys), season stats.
2. **Dry-run**: `node scripts/publish-season.mjs --dry-run` (validates, shows hashes).
3. **Publish**: `CANNON_PUBLISH_COOKIE='session=…' node scripts/publish-season.mjs`
   (admin session cookie; add `--origin http://localhost:4101` for local dev,
   `--only match-live` on matchday). Unchanged payloads are server-side no-ops.
4. Clients pick the change up within ~75s (15s edge cache + the app's poll).

App-shell copy changes (not data) still need a rebuild + rebake:
`bun run prepare:showcases && bun run build && bunx wrangler deploy` from
`apps/platform/`.

## Live scores without lifting a finger

The platform cron (`*/5 * * * *`, `cannon-ingest` handler) runs a
schedule-derived phase machine off the fixtures feed — countdown flips to
"match in progress" and back with **no provider configured at all**.

Set the `CANNON_FOOTBALL_API_TOKEN` wrangler secret (football-data.org, free
tier) and the same cron also refreshes fixtures hourly and polls real
score/minute/events during the match window. Provider data is stamped
`source: external-api`; manual publishes are `maker-upload`; the schedule
machine is `manual/schedule-machine` — readable provenance end to end.

## Community & moderation

- Identity = pool handle + app-issued UUID (`src/lib/handle.ts`). No accounts.
- Server-side: 30s compose cooldown, slur/direct-harm language gate,
  one-vote-per-key, one-report-per-key, auto-hide at 3 distinct reporters
  (`status='hidden'` — recoverable, never silently deleted).
- Client-side: majority-downvoted takes dim; reported takes hide locally
  immediately.

## Dev

```bash
bun run dev          # app on :5267 (expects platform dev server on :4101)
bun run test         # vitest — offline-ladder smoke + unit tests
bun run typecheck
```
