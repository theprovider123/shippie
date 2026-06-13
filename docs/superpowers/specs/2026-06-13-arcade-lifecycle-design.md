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
- A small **public endpoint `GET /api/arcade/roster`** returns two sets: `enabled` (slugs currently on in the cabinet) and `blocked` (slugs under enforcement — suspended / taken down). No auth, cacheable.
- The cabinet renders **`baked games ∩ enabled − blocked`**, with a **tiered fallback** (see Offline + enforcement below) so an ordinary curation pull fails *open* but an enforcement block fails *closed*.

This gives the requested live control — **admin toggles take games out of / back into the cabinet with no platform redeploy** — without the offline and curation costs of a fully runtime list. The only operation still requiring code is *adding a brand-new first-party game*, which is unavoidable (you are shipping a new game app + its display card) and, because remixes never enter the cabinet, there is no case where a cabinet game lacks baked metadata.

### "Enabled in arcade" — the single D1 signal

A game is **enabled in the cabinet** iff its `apps` row has:
`surface = 'arcade'` **AND** `slug ∈ ARCADE_GAME_SLUGS` (the generated baked allowlist) **AND** `visibility_scope = 'public'` **AND** not suspended (`suspended_at IS NULL`) **AND** `is_archived = 0`.

The `slug ∈ ARCADE_GAME_SLUGS` clause (P1a) is load-bearing: it prevents an admin-owned-but-unbaked app from being "enabled" in D1, returned by the endpoint, and routed into a cabinet that has no metadata to render it. The roster never includes a slug the cabinet can't draw.

The **"In arcade" toggle** flips `surface` between `'arcade'` (in) and `'archived'` (pulled). `visibility_scope` stays `'public'` so the standalone page keeps working (decision 4). No new column is required — but see **`archived` interop** below: this overloads `surface='archived'` and one existing admin behavior must be patched.

**Safety floor — precise guarantee, not absolute.** Suspended / takedown games are excluded from `enabled` *and* listed in `blocked`. The cabinet applies `blocked` even when offline (it is cached, see below), so **once the cabinet has fetched the roster at least once, a suspended game cannot keep playing** even with no network. The only residual window is a *cold first load with no cached roster while offline* — covered by the serve-layer backstop (the maker-app suspension gate) and, for first-party games, by their negligible takedown risk. The earlier "can never play" wording was too strong; this is the honest guarantee.

### `surface='archived'` interop (P1c)

`surface='archived'` is overloaded: it already means "hidden from marketplace shelves," and we now also use it for "pulled from cabinet." The leak: `admin/+page.server.ts` setVisibility auto-lifts `surface` `'archived' → 'featured'` whenever an app is (re)published public (line ~204). For a *baked arcade game* that has been deliberately pulled (archived + public), re-saving its visibility would silently re-add it to the cabinet and surface it as `featured`. **Fix:** that auto-lift must **skip baked arcade slugs** (`slug ∈ ARCADE_GAME_SLUGS`) — for them, `archived` is the intentional "pulled" state, and visibility changes must not mutate `surface`. The "In arcade" toggle is the only thing that moves an arcade game's `surface`.

### `GET /api/arcade/roster`

- Reads D1 `apps` for the enabled-in-arcade predicate above; returns `{ enabled: string[], blocked: string[], rev: string }`. `enabled` = baked arcade slugs passing the full predicate; `blocked` = baked arcade slugs that are suspended or taken down (the enforcement set the cabinet keeps even offline). `rev` is a short content hash of both sets for SW cache validation.
- Public, `cache-control: public, max-age=60`, SW caches stale-while-revalidate.
- **D1-first, no KV in v1.** The query is tiny; correctness beats shaving milliseconds, and a stale KV projection is exactly how a pulled/suspended game would leak. KV may become a later optimization *only* with a D1 content-hash + repair story (compare `rev`, repair on mismatch). Do not read KV for the roster in v1.

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

**Ordering (P0b) — load-bearing.** Today `/run/[slug]/+page.server.ts` calls the canonical redirect *first*, before any DB read (the early `canonicalShowcaseTarget` 302 at ~line 21). The plan must **reorder**: when `params.slug` is a baked arcade-game slug, `await isEnabledInArcade(db, params.slug)` **before** invoking the arcade-alias branch of the canonical redirect. Only the *arcade-alias* branch is gated — every other canonical/retired-slug redirect keeps its current order. `isEnabledInArcade` must use the same predicate as the roster endpoint (baked allowlist + public + not suspended/archived) so routing and roster never disagree.

The standalone bundles already exist and run on their own (verified during the 2026-06 build), so "serve standalone" is purely "do not redirect."

## Remix flow

When a user remixes an arcade game (e.g. Snake → their variant):

- It deploys as a **normal standalone app** at `/apps/<new-slug>` + `/run/<new-slug>`, lineage tracked via `remix_from` (existing behavior).
- **Surface guard (new) — baked allowlist only.** `surface = 'arcade'` is honored **only** for slugs in `ARCADE_GAME_SLUGS` (the generated baked list). Not "first-party/admin-owned," not verified makers — strictly baked. The cabinet depends on baked metadata, curated lanes, offline fallback, and first-party runtime assumptions, none of which a verified-maker app satisfies; they can be `featured`/`labs`, or later enter a separate reviewed pipeline that commits metadata into `games.ts`. Any non-allowlisted app declaring `arcade` (manifest or `--surface arcade`) is **downgraded to `'featured'`**, noted in the deploy response (`surface_downgraded: 'arcade'→'featured'`).
- **The guard applies to existing rows too (P1b), not just new claims.** `resolveSurface` currently *preserves* an existing `surface='arcade'` on redeploy (the `existing > fallback` rule, surface-resolver ~line 66). The guard must run **after** surface resolution and clamp the result: if the resolved surface is `'arcade'` and the slug is not in `ARCADE_GAME_SLUGS`, downgrade — regardless of whether the value came from the manifest, the form, or a preserved existing row. Paired with this, a **one-time migration sweep** downgrades any already-present non-allowlisted `surface='arcade'` rows to `'featured'` (see Migration).
- The remix does **not** inherit the `/run → /arcade` alias; it's its own app with its own standalone runtime.

## Cabinet behavior details

- Roster fetch on mount; SW-cached stale-while-revalidate; re-checks on `visibilitychange → visible`. On each success the cabinet **persists `{enabled, blocked, rev}` to localStorage** (`shippie:arcade:roster:v1`).
- **Tiered fallback (resolves the P0a fail-open/safety conflict):**
  1. live fetch succeeds → use it (and cache it).
  2. fetch fails **with a cached roster** → use the **last-known** `enabled` and `blocked`. A game pulled or suspended while the user was last online stays gone offline.
  3. fetch fails **cold (no cache)** → fail **open** on curation (show the full baked roster) but still subtract any baked blocklist. This is the only window a suspended game could appear; it's backstopped by the serve layer and first-party low risk.
  - Render is always `baked ∩ enabled − blocked`. `blocked` (enforcement) is **always** subtracted; only `enabled` (curation) fails open in tier 3.
- Deep link `?game=<slug>` where the game is **not currently enabled** (pulled) or **blocked** → fall back to the first enabled game with a quiet inline note ("that one isn't in the cabinet right now"), never a broken frame.
- Lanes with zero enabled games are hidden.

## Testing

- **Roster endpoint:** `enabled` excludes archived / suspended / non-public **and** any slug not in `ARCADE_GAME_SLUGS`; `blocked` lists baked arcade slugs that are suspended/taken down; `rev` changes when either set changes. A `surface='arcade'` row for an unbaked slug is returned in *neither* set.
- **Surface guard:** baked slug keeps `arcade`; non-baked app declaring `arcade` via manifest **or** form **or** a preserved existing row is downgraded to `featured` with the response flag. (Explicitly cover the existing-row path — the `existing > fallback` preserve must not bypass the guard.)
- **Migration sweep:** a seeded non-allowlisted `surface='arcade'` row is downgraded to `featured`; baked arcade rows are untouched.
- **Routing (ordering):** for a baked arcade slug, `isEnabledInArcade` is consulted before the arcade-alias redirect — enabled → 302 into cabinet; pulled → serves standalone (no redirect). Non-arcade canonical/retired-slug redirects keep their current order.
- **`archived` interop:** re-publishing visibility of a *pulled baked arcade game* (archived + public) does **not** auto-lift `surface` to `featured` (the auto-lift skips baked arcade slugs); a normal non-arcade archived app still auto-lifts as before.
- **Cabinet:** render = `baked ∩ enabled − blocked`; tier-2 fallback uses cached enabled/blocked (suspended stays gone offline); tier-3 cold fallback shows baked minus baked-blocklist; unknown/pulled/blocked `?game=` falls back gracefully; empty lane hidden.
- **Admin toggle:** flips surface arcade↔archived, writes audit row, syncs KV, leaves visibility/suspension untouched.
- **Drift test (evolved):** baked `ARCADE_GAMES` ⊇ every first-party `surface='arcade'` row (offline fallback stays complete). Replaces the current "surface=arcade ⇒ must be in games.ts" with the superset direction.

## Migration / touchpoints

- **D1 migration:** (a) ensure each baked arcade game row has `surface='arcade'` (mostly there post-0066); (b) **sweep** — downgrade any `surface='arcade'` row whose slug is **not** in `ARCADE_GAME_SLUGS` to `'featured'` (P1b cleanup). No schema change (reuse `surface`).
- `apps/platform`: new `/api/arcade/roster` endpoint (D1-first, returns `{enabled, blocked, rev}`); admin "In arcade" action + row control; `isEnabledInArcade(db, slug)` helper sharing the roster predicate; surface-guard clamp **after** `resolveSurface` (covers manifest/form/existing); the `archived → featured` auto-lift in setVisibility patched to skip `ARCADE_GAME_SLUGS`; reordered conditional redirect in `/run/[slug]` (and `/apps/[slug]` where it redirects).
- `apps/showcase-arcade`: fetch roster, render `baked ∩ enabled − blocked`, tiered offline fallback with localStorage cache, deep-link fallback, hide empty lanes.
- Evolve `apps/showcase-arcade/src/games.test.ts` drift test.
- **`ARCADE_GAME_SLUGS` is the shared allowlist** (already in `apps/platform/src/lib/showcase-slugs.ts`). The roster endpoint, the surface guard, the migration sweep, the auto-lift skip, and `isEnabledInArcade` all key off this one constant so "baked arcade game" has a single definition. Note it currently does **not** include `docklands` (added to the cabinet via `games.ts` but routed standalone, not aliased) — reconcile this during planning: the allowlist must match the set of slugs the cabinet can actually render (the baked `ARCADE_GAMES` ids), which is the superset including `docklands`.

## Out of scope (YAGNI)

- A separate `/arcade` marketplace shelf distinct from the cabinet (rejected — one arcade).
- A "Community / Remixes" lane in the cabinet (rejected — cabinet stays first-party curated).
- Serve-layer suspension gating of first-party `/__shippie-run/*` runtimes (first-party games aren't a takedown risk; the roster filter + standalone-visibility cover the real cases). Revisit only if third-party apps ever serve under `/__shippie-run`.
- Storing arcade display metadata in D1 (kept baked/curated on purpose).
