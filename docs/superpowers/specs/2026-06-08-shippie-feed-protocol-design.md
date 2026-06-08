# Shippie Feed Protocol

**Date:** 2026-06-08
**Status:** Phase 1 (this spec) — additive, launch-safe.
**Why:** Apps like Golazo need regularly-refreshed data (live scores, fixtures, results) that
is NOT an app update. Today any version churn can prompt "update this app". Feeds are a third
lane: silent, cached, offline-friendly data refresh — reusable by any Shippie app.

## The three lanes

1. **Platform update** — Shell/runtime changes. All apps inherit. No maker action, no user prompt.
2. **App package update** — Maker ships new code/permissions/schema/assets. May need user review.
3. **Feed / data refresh** — Scores, fixtures, weather, prices. **Silent by default.** Only ever
   surfaces to a user if the feed's *schema* or *permissions* change — never on a routine refresh.

Golazo scores live in lane 3. This protocol owns lane 3 for the whole platform.

## Design principles

- **Apps stay local + offline.** A feed is a cacheable snapshot; the last-good copy is kept on
  device so an offline cold start still shows the most recent known state.
- **Declared + inspectable.** An app declares its feeds in `shippie.json`. The platform owns the
  fetch/validate/store pipeline; app JS never writes platform feed state directly.
- **Versioned + hashable.** Every snapshot is an envelope with a `sequence`, `updatedAt`,
  `staleAfter`, `dataSchema` and a content `hash`, so clients can cheaply tell "did it change?".
- **Reusable.** Nothing in the core is Golazo-specific. Golazo is just the first consumer.

## Feed envelope (the wire format)

```jsonc
{
  "schema": "shippie.feed.v1",   // envelope version
  "app": "golazo",
  "feed": "scores",
  "dataSchema": "golazo.scores.v1", // app-defined payload schema id
  "sequence": 184,                // monotonic; bumps on every publish
  "updatedAt": "2026-06-08T09:55:00Z",
  "staleAfter": "2026-06-08T10:10:00Z",
  "hash": "fnv1a:9af2…",          // hash of the canonical payload
  "source": { "kind": "external-api" | "maker-upload" | "manual", "name": "official-scores" },
  "payload": { /* app-shaped, validated against dataSchema */ }
}
```

The envelope logic (build, canonicalise, hash, normalise, `hasChanged(since)`) is **pure and
shared**: `packages/sdk/src/feeds.ts` for clients, mirrored in
`apps/platform/src/lib/server/feeds/envelope.ts` for the worker (a tiny FNV-1a hash, no crypto
dep). Both are unit-tested.

## Storage (D1)

A single latest-snapshot row per `(app, feed)` — migration `0056_app_feeds.sql`:

```
app_feeds(
  id text pk,                 -- `${app}:${feed}`
  app_slug text not null,
  feed_id text not null,
  data_schema text not null,
  sequence integer not null,  -- bumped each publish
  updated_at text not null,
  stale_after text,
  hash text not null,
  source_kind text not null,
  source_name text,
  payload text not null,      -- JSON
  created_at integer not null,
  unique(app_slug, feed_id)
)
```

Latest-only keeps it simple and bounded; `sequence` gives clients change-detection and a future
delta path. (History/R2 large-payloads are Phase 2 — see below.)

## Routes (additive, under the existing api tree)

- `GET /api/apps/[slug]/feeds/[feed]` — **public**. Returns the latest envelope. `?since=N`
  returns `{ changed:false, sequence }` (200, tiny) when `N >= sequence`, else the full envelope.
  `Cache-Control: public, max-age=15, stale-while-revalidate=60`.
- `POST /api/apps/[slug]/feeds/[feed]` — **authenticated** (app owner via `resolveRequestUserId`,
  or a per-app feed ingest token). Body = `{ dataSchema, payload, staleAfter?, source? }`. The
  worker validates the payload against the registered `dataSchema`, computes the hash, and upserts
  with `sequence = prev+1` (no-op + same sequence if the hash is unchanged). Returns the envelope.

## Schema registry

`apps/platform/src/lib/server/feeds/schemas.ts` maps a `dataSchema` id → a validator
`(payload:unknown) => string[] /* errors */`. Phase 1 ships `golazo.scores.v1`,
`golazo.results.v1`, and a permissive `*.raw.v1` escape hatch. Unknown schema → 400. This is the
ring-fence: only declared, validated shapes get stored.

## SDK surface (`shippie.feeds`)

```ts
shippie.feeds.get(app, feed, { since? })  // fetch latest; caches last-good in localStorage
shippie.feeds.subscribe(app, feed, cb, { intervalMs })  // poll; fires cb only when sequence bumps
shippie.feeds.cached(app, feed)           // synchronous last-good (offline cold start)
// pure helpers: buildEnvelope, hashPayload, normaliseEnvelope, hasChanged
```

The SDK was local-first; `feeds` is its first *networked* namespace (feeds inherently need the
net), but it degrades to the cached snapshot offline — consistent with the local-first ethos.

## Offline behaviour

On save, an app's offline capsule includes the last-good feed snapshot + its metadata. Offline,
the app shows the cached data with an "as of {updatedAt}" note and never blocks on a reload or an
update prompt. Golazo already follows this pattern in `feed.ts`; Phase 1 makes it read the
platform endpoint first, then its bundled static `feed.json`, then the localStorage cache.

## shippie.json declaration

```jsonc
"feeds": [
  { "id": "scores", "dataSchema": "golazo.scores.v1", "refresh": "5m", "staleAfter": "15m",
    "visibility": "public", "offline": true }
]
```

Phase 1 parses this into the app spec for discovery + capability display. The route works with or
without the declaration; the declaration is what lets the platform show "this app refreshes scores
every 5 min" and (Phase 2) drive a scheduled poller.

## Security

- App code cannot write platform feed state directly — only the authenticated POST can.
- External feeds are fetched by Shippie workers (Phase 2 poller), not arbitrary app JS.
- Payloads are schema-validated and hashed; schemas are versioned.
- Feed writes are app-scoped (owner or app-scoped ingest token only).
- App-package updates and feed refreshes are never mixed (different lanes, different prompts).

## Phase 1 (now) vs Phase 2 (post-launch)

**Phase 1 — built now (additive, launch-safe):** envelope lib (+tests), D1 `app_feeds` (mig 0056),
GET/POST routes, schema registry, SDK `feeds` namespace, Golazo wired to read the endpoint with
static + cache fallback, `shippie.json` feeds parsing.

**Phase 2 — documented, deferred:** scheduled external-API pollers per app (cron → ingest),
cryptographic signing of snapshots, R2 for large payloads + snapshot history, a maker-facing feed
upload UI, and per-user feed permissions surfacing. None are needed for launch; all are seams the
Phase 1 shape already leaves open (`source.kind`, `sequence`, the envelope hash).

## Testing

- `feeds.test.ts` (SDK, bun:test) + `envelope.test.ts` (platform, vitest): hashing determinism,
  `hasChanged`, normalise/round-trip, schema validation accept/reject, sequence bump on change /
  no-op on identical payload.
- Root `bun run health` gates the platform changes.
