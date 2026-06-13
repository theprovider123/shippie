# Arcade Game Lifecycle — Design

> Status: approved direction (2026-06-13). Decides how games move in and out of the Arcade cabinet, how admin "unlisting" reaches the cabinet, and what happens when a user remixes an arcade game.

## Problem

The Arcade cabinet (`apps/showcase-arcade`) renders a **hardcoded** game list (`ARCADE_GAMES` in `src/games.ts`), baked at build time, and iframes each game from `/__shippie-run/<id>/` — which is served as raw first-party static with **no visibility / archive / suspension check**. Consequences today:

- Admin unlisting/archiving/suspending a game writes D1 columns + a KV kill-switch, but the cabinet never reads any of it → an unlisted, archived, or even suspended game **keeps showing and playing in the cabinet**.
- "Move a game in/out of arcade" means editing `games.ts`, flipping `curation.surface` in its `shippie.json`, and **redeploying the whole platform**.
- `surface: 'arcade'` is honored from any maker's manifest by `resolveSurface`, so a remix can claim it in D1 — though it still can't enter the static cabinet, and the existing drift test only guards first-party showcase folders, not R2 remixes.
- `/arcade` loads the cabinet **app itself** (`requestedAppSlug: 'arcade'`), not a separate marketplace shelf. There is exactly one arcade experience: the cabinet. "Removed from arcade" must mean "removed from the cabinet roster."

## Decisions (locked)

1. **Roster source:** baked curated roster for display + offline fallback, **filtered live** by an admin-controlled D1 signal. (Refinement of "runtime catalog" — see Architecture for why not a fully data-driven list.)
2. **Remix policy:** a remix of an arcade game **never enters the cabinet**. It deploys as a normal standalone app at `/apps/<slug>` + `/run/<slug>`.
3. **Admin control:** a dedicated **"In arcade"** toggle, orthogonal to visibility/suspend.
4. **Pulled games keep a working standalone page** (option b): pulling a game from the cabinet must not break its standalone `/run/<slug>`.

## Architecture — baked roster + live enable-filter

The cabinet is an **offline-first** local app served from the service worker. A hard network dependency for its whole roster would break that (open it offline → empty arcade) and would mean the cabinet's curated display metadata (lane, accent, loop/tempo, controls, description, initials) comes from arbitrary data. So the roster is split:

- **`games.ts` stays the curated display roster + offline fallback** — baked first-party metadata, the superset of all first-party arcade games.
- A small **public endpoint `GET /api/arcade/roster`** returns the live on/off set: the slugs that are currently *enabled* in the cabinet. No auth, cacheable.
- The cabinet renders **`baked games ∩ live slugs`**. If the fetch fails (offline), it shows the **full baked roster** (fail-open is safe — every baked game is first-party and curated).

This gives the requested live control — **admin toggles take games out of / back into the cabinet with no platform redeploy** — without the offline and curation costs of a fully runtime list. The only operation still requiring code is *adding a brand-new first-party game*, which is unavoidable (you are shipping a new game app + its display card) and, because remixes never enter the cabinet, there is no case where a cabinet game lacks baked metadata.

### "Enabled in arcade" — the single D1 signal

A game is **enabled in the cabinet** iff its `apps` row has:
`surface = 'arcade'` **AND** `visibility_scope = 'public'` **AND** not suspended (`suspended_at IS NULL`) **AND** `is_archived = 0`.

The **"In arcade" toggle** flips `surface` between `'arcade'` (in) and `'archived'` (pulled). `visibility_scope` stays `'public'` so the standalone page keeps working (decision 4). No new column is required.

**Safety floor (non-negotiable, independent of the toggle):** suspended or archived games are *always* excluded from the roster endpoint, even if something left `surface = 'arcade'`. A DMCA'd / policy-suspended game can never keep playing in the cabinet.

### `GET /api/arcade/roster`

- Reads D1 `apps` for the enabled-in-arcade predicate above; returns `{ slugs: string[], rev: string }` where `rev` is a short content hash for SW cache validation.
- Public, `cache-control: public, max-age=60`, SW caches stale-while-revalidate.
- Source of truth is D1; the admin toggle + suspend already sync `apps:{slug}:meta` in KV, so the endpoint may read either — D1 is canonical, KV is the fast path. Keep it D1-first for correctness; KV is optimization, not required for v1.

## Admin "In arcade" toggle

- New form action on the admin apps page (and a control on the app row) that sets `surface` to `'arcade'` (add) or `'archived'` (pull) on the selected app. Only valid for games (category `games` / first-party). Visibility and suspension are untouched.
- Writes an `audit_log` row (`admin.app.set_arcade`, before/after surface) via `recordAudit`.
- Syncs `apps:{slug}:meta` in KV so the roster endpoint and routing reflect the change immediately (mirrors the existing `setVisibility` KV sync; failure logged, `reconcile-kv` repairs).

## Routing — conditional alias (decision 4)

"In arcade" controls **two coupled behaviors** off the same signal:

1. **Cabinet roster membership** (above).
2. **`/run/<slug>` redirect target.** While a game is enabled-in-arcade, `/run/<slug>` 302s into the cabinet (`/arcade?game=<slug>` — current behavior). Once **pulled**, `/run/<slug>` serves the game's **own baked `/__shippie-run/<slug>/` runtime standalone** (no redirect).

`canonicalShowcaseTarget` stays a **pure, zero-DB function** (it's used widely); it continues to express the arcade alias as the *preferred-when-live* target. The DB-conditional decision lives in the server loads that perform the redirect (`/run/[slug]/+page.server.ts`, and the `/apps/[slug]` detail where relevant), via a shared helper `isEnabledInArcade(db, slug): Promise<boolean>`:

- arcade-game slug **enabled** → redirect into cabinet (as today).
- arcade-game slug **pulled** → skip the arcade alias, serve standalone.

The standalone bundles already exist and run on their own (verified during the 2026-06 build), so "serve standalone" is purely "do not redirect."

## Remix flow

When a user remixes an arcade game (e.g. Snake → their variant):

- It deploys as a **normal standalone app** at `/apps/<new-slug>` + `/run/<new-slug>`, lineage tracked via `remix_from` (existing behavior).
- **Surface guard (new):** `resolveSurface` / deploy preflight only honors `surface = 'arcade'` for **first-party / admin-owned** apps. A maker or remix declaring `arcade` in its manifest (or `--surface arcade`) is **downgraded to `'featured'`**, noted in the deploy response (`surface_downgraded: 'arcade'→'featured'`). So a remix cannot smuggle itself into the curated cabinet.
- The remix does **not** inherit the `/run → /arcade` alias; it's its own app with its own standalone runtime.

## Cabinet behavior details

- Roster fetch on mount; SW-cached stale-while-revalidate; re-checks on `visibilitychange → visible`.
- Offline / fetch error → full baked roster.
- Deep link `?game=<slug>` where the game is **not currently enabled** → fall back to the first enabled game with a quiet inline note ("that one isn't in the cabinet right now"), never a broken frame.
- Lanes with zero enabled games are hidden.

## Testing

- **Roster endpoint:** enabled predicate excludes archived / suspended / non-public; includes only `surface='arcade'` public live rows; `rev` changes when the set changes.
- **Surface guard:** first-party app keeps `arcade`; maker/remix app declaring `arcade` is downgraded to `featured` with the response flag.
- **Routing:** `isEnabledInArcade` true → `/run/<slug>` redirects to cabinet; false → serves standalone (no redirect).
- **Cabinet:** intersection (baked ∩ live) renders correctly; offline fallback shows full baked roster; unknown/pulled `?game=` falls back gracefully; empty lane hidden.
- **Admin toggle:** flips surface arcade↔archived, writes audit row, syncs KV, leaves visibility/suspension untouched.
- **Drift test (evolved):** baked `ARCADE_GAMES` ⊇ every first-party `surface='arcade'` row (offline fallback stays complete). Replaces the current "surface=arcade ⇒ must be in games.ts" with the superset direction.

## Migration / touchpoints

- D1 migration: ensure each first-party arcade game row has the intended `surface='arcade'` (data already mostly there post-0066); no schema change (reuse `surface`).
- `apps/platform`: new `/api/arcade/roster` endpoint; admin action + row control; `isEnabledInArcade` helper; surface-guard in the resolver/preflight; conditional redirect in `/run/[slug]` (and `/apps/[slug]` where it redirects).
- `apps/showcase-arcade`: fetch roster, intersect with baked, offline fallback, deep-link fallback, hide empty lanes.
- Evolve `apps/showcase-arcade/src/games.test.ts` drift test.

## Out of scope (YAGNI)

- A separate `/arcade` marketplace shelf distinct from the cabinet (rejected — one arcade).
- A "Community / Remixes" lane in the cabinet (rejected — cabinet stays first-party curated).
- Serve-layer suspension gating of first-party `/__shippie-run/*` runtimes (first-party games aren't a takedown risk; the roster filter + standalone-visibility cover the real cases). Revisit only if third-party apps ever serve under `/__shippie-run`.
- Storing arcade display metadata in D1 (kept baked/curated on purpose).
