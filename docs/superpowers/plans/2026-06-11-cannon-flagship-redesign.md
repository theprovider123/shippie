# The Cannon — flagship Arsenal fan app: review + redesign plan

Date: 2026-06-11. Status: PROPOSED (review delivered, no code yet).
Scope: `apps/showcase-cannon/` + `apps/platform/src/routes/api/cannon/*` + `apps/platform/src/lib/server/cannon/` + feed/cron/intent integration.

---

## 1. Blunt product review

**Verdict: a beautiful screenshot, not a season app.** The visual identity is genuinely strong and the community layer (takes/votes/gauge) is real and well-engineered. But five of six data surfaces are TypeScript constants compiled into the bundle, the app cosplays as an iPhone on desktop, "live" is a decorative pulsing dot, and there is no way to update anything without a code deploy. A fan who installs this in August will watch it rot by September.

### What is good (keep all of this)

- **Visual language.** Cream matchday-programme palette + Arsenal red + gold, Playfair/Barlow Condensed/Inter, the original cannon SVG (`src/components/chrome.tsx:12` — no copyrighted crest). Distinctive, not generic.
- **The offline ladder in `src/lib/api.ts`.** server → localStorage last-good → seed, optimistic writes, offline takes queued in `cannon_local_takes` and replayed/deduped on reconnect (`fetchTakes`, api.ts:50-70). This is the golazo `feed.ts` idiom done properly.
- **The server layer** (`apps/platform/src/lib/server/cannon/index.ts`, routes under `api/cannon/`): handle pool validation, anonKey shape check, 30s compose cooldown, one-vote-per-anonKey with idempotent flips and baseline+delta counters (`votes/+server.ts`), partial gauge upsert with explicit-null clears (`gauge/+server.ts`). All tested (3 route test files + handle/heat/tz unit tests).
- **Anonymous identity by design.** Pool handle + app-issued UUID (`src/lib/handle.ts`), no platform session — private by default.
- **The Gauge dial SVG** (`GaugeScreen.tsx:25-111`), heat-is-earned concept (`heat.ts`), trophy timeline, self-hosted fonts (CSP-safe), honest network-first service worker (`public/sw.js`).

### What is bad

1. **It's hardcoded demo fiction.** `data/match.ts` (NEXT_MATCH, CURRENT_MATCH, ORACLE copy, THIS_DAY pinned to June 9), `data/fixtures.ts` (22 fixtures, Aug–Dec only, display-string dates with no year), `data/squad.ts` (15 players, frozen stats), `data/club.ts`, `data/h2h.ts`. Every result, injury, or postponement = edit TS → rebuild → rebake → redeploy.
2. **Fake phone chrome.** `StatusBar` (chrome.tsx:41) renders a fake iOS clock/wifi/battery; `.phone-frame` + `.dynamic-island` (styles.css) wrap the app in a fake iPhone on desktop. Installed as a real PWA this gives double status bars. Flagship apps don't cosplay as their own screenshots.
3. **The home screen doesn't answer "what's happening right now."** There is no live state at all. The Terrace "Live" dot (TerraceScreen.tsx:179-184) pulses 24/7. `daysTo` is computed once per mount (`useMemo` with `[]`, HomeScreen.tsx:25-28) and never ticks.
4. **IA is abstract and one tab too heavy.** ORACLE/TERRACE/GAUGE/FIXTURES/CLUB — three names need explaining. Gauge is a permanent tab for a single post-match interaction. Tab id `'archive'` is labelled CLUB (chrome.tsx:9 vs :119).
5. **Inline-style soup.** `homL/homB`, `terL/terB`, `gauL/gauB`, `fixL`, `cL/cB` are five copies of the same two styles. styles.css ships `.micro-label`, `.card`, `.section` utilities the screens never use. ~1,300 lines of screens are mostly style objects.
6. **Lies in the data.** `GAUGE_FALLBACK` claims 14,832 raters (api.ts:130) vs 25 seed rows in `0060_cannon.sql`; `gauge.avg ?? 7.4` fabricates a rating when none exists (GaugeScreen.tsx:133); TV channel is guessed from competition (FixturesScreen.tsx:196); kickoff is hardcoded '15:00' everywhere; `kickoffISO: '2026-08-16T00:00:00'` has no timezone.
7. **Won't survive a season.** Takes capped at `LIST_LIMIT = 50` newest with no pagination and no per-match scoping — three static threads for 10 months. Heat thresholds (400/1000 upvotes, heat.ts) calibrated to fake seed counts; a real community of dozens stays "cold" forever. Month filter is `date.includes(activeMonth)` substring matching (FixturesScreen.tsx:230).
8. **Moderation is one heuristic.** `isDimmed` (downvote ratio) is the only mechanism. No report path, no hide, no admin removal, no profanity filter. anonKey rotation (clear localStorage) bypasses cooldown and re-votes.
9. **Not Shippie-native.** No `@shippie/iframe-sdk` usage; `shippie.json` intents both empty; `state.ts:605-615` entry has no intents; the Feed Protocol (`drizzle/0056_app_feeds.sql`, `/api/apps/[slug]/feeds/[feed]`, `packages/sdk/src/feeds.ts`) — built for exactly this shape of data — is unused; `@shippie/showcase-kit-v2` (QrShareSheet, EmptyState, IntentToastHost) unused; **zero share affordances anywhere in the app**.

---

## 2. Proposed information architecture

Four tabs, plain names. The Gauge becomes a *state*, not a place.

1. **Now** (home) — a matchday state machine driven by the `match-live` feed phase:
   - `pre` (matchday): big countdown (ticking), confirmed lineups when available, Oracle preview, fan-confidence poll, "remind me" affordance.
   - `live` / `ht`: score, minute, events timeline, inline terrace quick-reactions, live fan mood.
   - `ft` (post, ~48h): result + the Gauge dial + mood + moment + share card.
   - `idle` (off-days): last result strip, next match countdown card, latest news (summarized + linked out), take of the day, this-day-in-history.
2. **Matches** — season-long fixtures and results from the fixtures feed; month nav; match detail = H2H, preview, result stats, that match's gauge archive and terrace thread.
3. **Terrace** — fan feed scoped by match thread + General; quick reactions; polls; report/hide; heat.
4. **Squad** — player cards with availability (fit/doubt/injured/suspended), form, stats, contract/transfer notes; player detail keeps the ghost-number treatment. Club history lives here as a "Club" section (evergreen content doesn't earn a tab).

Desktop is a deliberate two-pane layout (Now/Matches content + persistent Terrace rail), not a fake phone.

---

## 3. Data model

### Principle
Two kinds of data, two stores, both already exist on the platform:

- **Community writes** (takes, votes, gauge, polls, reports) → D1 `cannon_*` tables (extend migration 0060).
- **Editorial/season snapshots** (fixtures, live match state, squad, news, previews, config) → **Shippie Feed Protocol** (`app_feeds` table from migration 0056, routes at `/api/apps/cannon/feeds/<feed>`). The envelope already carries provenance: `sequence`, `updatedAt`, `staleAfter`, `hash`, `source {kind: external-api|maker-upload|manual, name}`.

### Feeds (new validators in `apps/platform/src/lib/server/feeds/schemas.ts`)

| Feed | Schema | Payload | Refresh |
|---|---|---|---|
| `fixtures` | `cannon.fixtures.v1` | `{season, table_position?, fixtures: [{id, kickoffUtc, comp, round?, opponent, opponentShort, venue: H/A/N, ground, tv?, status: scheduled/live/ft/postponed, score?, difficulty, h2h?}]}` | hourly + manual |
| `match-live` | `cannon.match.v1` | `{phase: idle/pre/live/ht/ft, matchId, kickoffUtc, score, minute?, events: [{min, type, player?, detail}], lineups?, preview?: {quote, confidence, keyBattle}, postMatch?}` | 5-min cron on matchday |
| `squad` | `cannon.squad.v1` | `{players: [{id, num, name, full, nat, pos, group, availability: fit/doubt/injured/suspended, availabilityNote?, stats {apps, goals, assists, rating}, form[], news?}]}` | daily + manual |
| `news` | `cannon.news.v1` | `{items: [{id, title, summary, url, source, publishedAt, tag}]}` — own-words summary + link out, never wholesale copy | hourly |
| `club` | `cannon.club.v1` | trophies, this-day entries (keyed by MM-DD), season records | manual, rare |

Per-item manual overrides: payload items may carry `override: true`; ingest merges provider data but never clobbers overridden items.

### D1 changes (migration 0061)

- `cannon_takes`: add `match_id TEXT` (nullable — null = General), `status TEXT NOT NULL DEFAULT 'visible'` (visible/hidden/removed), `report_count INTEGER NOT NULL DEFAULT 0`.
- New `cannon_reports (take_id, anon_key, reason, created_at, PRIMARY KEY (take_id, anon_key))`.
- New `cannon_polls (id, match_id?, question, options_json, closes_at, created_at)` + `cannon_poll_votes (poll_id, anon_key, option_idx, created_at, PRIMARY KEY (poll_id, anon_key))`.
- `cannon_gauge` unchanged (already per-match).

### Storage placement

- **D1**: community tables + `app_feeds` snapshots (single source of published truth).
- **KV**: not needed — the feeds GET route already serves with `max-age=15, stale-while-revalidate=60`.
- **R2**: only if/when we pre-render share-card PNGs (deferred; DOM share sheets first).
- **Static JSON in bundle** (`src/season/*.json`): launch-day fixtures/squad as the final fallback rung.
- **localStorage**: SDK `feeds.cached()` last-good + queued local takes (exists) + queued gauge/votes.

### Provider abstraction (Phase 4)

```ts
// apps/platform/src/lib/server/cannon/providers/types.ts
interface FootballDataProvider {
  name: string;
  fixtures(seasonId: string): Promise<ProviderFixture[]>;
  liveMatch(externalMatchId: string): Promise<ProviderMatchState | null>;
}
```
- `football-data.org` free tier first (PL coverage, 10 req/min — fine for 5-min polling). API-Football behind the same interface if lineups/injuries are wanted later. News via RSS (Arsenal.com + BBC Sport Arsenal feeds). Secrets via wrangler (`CANNON_FOOTBALL_API_TOKEN`); no provider name hardcoded into payloads beyond `source.name`.
- **Manual mode is a first-class provider**: repo JSON + publish script; works with zero external API forever.

### Offline behavior

- Every feed surface renders last-good with an "as of <time>" stale label once past `staleAfter`.
- Live phase degrades honestly: offline during a match shows "live updates paused — offline" rather than a frozen score with no warning.
- Writes (takes, gauge, votes, poll votes) queue locally and replay (takes already do; extend the idiom).
- Empty states via showcase-kit `EmptyState` (skin block required — kit ships zero CSS).

### Privacy / moderation

- Keep pool handles + anonKey; widen pools. No emails, no accounts, no tracking. Telemetry = the platform's existing rollups only; the app sends nothing beyond its API writes.
- Server: keep 30s compose cooldown; add per-IP rate limit on POST takes/votes/reports (pattern exists in `wrapper/router/push.ts` — 30/min per slug+IP); small profanity/abuse denylist at insert; auto-hide at N reports (`status='hidden'`, surfaced in admin queue); admin moderation route gated the same way as feeds POST (admin-only).
- Vote abuse: one-per-anonKey exists; accept softness, add per-IP daily vote cap server-side.

---

## 4. Shippie integration

- **Canonical URL**: `/cannon` already works via `[slug=appslug]` with OG from name/description + `appShareImageUrl('cannon')` — supply a proper Cannon share image; sharpen `state.ts` description. Deep links `?m=<matchId>`, `?take=<id>`, `?p=<playerId>` handled in-app.
- **Intents** (declare in `state.ts` + `shippie.json`, satisfy `intent-graph.test.ts` — whitelist in `ALLOWED_ORPHAN_PROVIDERS` until consumers exist): provides `live.event.v1` (canonical), plus `match-starting`, `score-updated`, `fan-reaction`, `player-news`, `fixture-reminder`. Broadcast via `shippie.intent.broadcast` from `@shippie/iframe-sdk`.
- **Feeds**: declare in `shippie.json` `"feeds"` array; consume via `@shippie/sdk` `feeds.get/subscribe/cached`.
- **Ingest**: platform cron (`handleScheduled` in `apps/platform/src/lib/server/cron/index.ts`) gains a `cannonIngest` handler on the existing `*/5 * * * *` trigger; matchday-aware (poll live only near/inside a match window; fixtures/news hourly). Plus maker-triggered publish (script/admin) for instant corrections.
- **Notifications**: subscribe infra exists (`/__shippie/push/*` + `wrapperPushSubscriptions`) but **no send pipeline yet** — kickoff reminders are Phase 5 and gated on platform work. Zero-infra fallback shipping earlier: "Add to calendar" .ics download per fixture.
- **Telemetry**: none beyond platform rollups; all Cannon API responses human-readable JSON; feed envelope provenance doubles as the readable audit trail.

---

## 5. Immediate fixes (safe, before any phase)

1. `GaugeScreen.tsx:133` — `gauge.avg ?? 7.4` fabricates a score; render "No ratings yet" state instead.
2. `api.ts:130` — `GAUGE_FALLBACK` count 14,832 → honest zero-state.
3. `HomeScreen.tsx:25-28` — countdown never ticks (empty-dep `useMemo`); interval + show actual date/time.
4. `FixturesScreen.tsx:196` — delete the guessed TV channel (wrong data is worse than none).
5. `data/match.ts` — `kickoffISO` lacks timezone; use UTC `Z` and render via the existing tz lib.
6. `chrome.tsx:9` — rename tab id `'archive'` → `'club'`.
7. `heat.ts` — thresholds 400/1000 unreachable for a real community; make relative (percentile/log) or drop to ~10/50 until live tuning.
8. `TerraceScreen.tsx:179-184` — always-on "Live" pulse; remove until bound to real live phase.
9. Delete the fake `StatusBar` clock/battery/wifi (chrome.tsx:33-71) — defensible even before the full redesign.

---

## 6. Phased plan

### Phase 1 — IA + UI simplification
- **Files**: `showcase-cannon/src/{App.tsx, components/chrome.tsx, styles.css}`, screens → `NowScreen/MatchesScreen/TerraceScreen/SquadScreen` (Gauge + Club fold in), `shippie.json`, `state.ts:605-615` description. Add showcase-kit-v2 dep + required skin block (~56 rules, reference: `showcase-chiwit/src/styles.css`).
- **Schema**: none.
- **Tests**: update `src/app.test.tsx` (tab names/count); keep lib tests; platform catalog-drift test ⇒ requires full `bun run prepare:showcases` rebake (NOT `prepare:generated`).
- **Acceptance**: 4 tabs with plain names; no `.phone-frame`/`StatusBar`/dynamic-island; screens use shared CSS classes (no repeated CSSProperties objects); deliberate desktop layout; immediate fixes 1–9 included; `bun run health` green.
- **Risks**: visual regression (screenshot before/after via the `_shotkit` harness); rebake/deploy ordering gotcha (generator → build → deploy).

### Phase 2 — data model + local/offline cache
- **Files**: new feed validators in `apps/platform/src/lib/server/feeds/schemas.ts`; `showcase-cannon/src/lib/feeds.ts` (SDK or ladder-replica client); `src/season/*.json` seed fallback; delete `src/data/{match,fixtures,squad,club,h2h}.ts` as sources (keep as seed payloads); stale labels + empty states.
- **Schema**: migration `0061_cannon_v2.sql` (takes columns, reports, polls); seed `app_feeds` rows for cannon feeds.
- **Tests**: validator unit tests per `cannon.*.v1` schema; feeds route tests for cannon publishes; app ladder tests (online→cached→seed); takes-with-match_id route tests.
- **Acceptance**: app renders 100% from feeds with seed fallback offline; every surface shows provenance ("as of", source) when stale; match-scoped terrace threads work; report path live with auto-hide.
- **Risks**: D1 `ALTER TABLE` additive-only (fine on SQLite); feed payload size (full season fixtures ~22KB — fine); migration must run local + prod (`db:migrate`).

### Phase 3 — admin/manual update pipeline
- **Files**: `apps/showcase-cannon/season/{fixtures,squad,news,match}.json`; `scripts/cannon-publish.mjs` (validates against schemas, POSTs to `/api/apps/cannon/feeds/*` with admin auth, prints sequence/hash diff); runbook `docs/superpowers/plans/` or app README section. Optional later: tiny admin screen.
- **Schema**: none.
- **Tests**: publish script dry-run test (schema validation + hash idempotency: unchanged payload ⇒ no sequence bump).
- **Acceptance**: edit JSON → one command → app updates within 75s (cache TTL); `override: true` items survive subsequent ingests.
- **Risks**: admin-auth ergonomics from a script (token vs session) — open question; resolve against how feeds POST auth works today.

### Phase 4 — live API ingestion
- **Files**: `apps/platform/src/lib/server/cannon/providers/{types,football-data,manual,rss-news}.ts`; `apps/platform/src/lib/server/cron/cannon-ingest.ts` + registration in `cron/index.ts` dispatch; wrangler secret.
- **Schema**: none (publishes through feeds).
- **Tests**: provider mapping tests against recorded fixtures; cron dispatch test extension (`vi.fn()` injection pattern); override-preservation merge tests; rate-limit/backoff behavior.
- **Acceptance**: fixtures auto-refresh hourly; on matchday, `match-live` phase transitions pre→live→ht→ft within one 5-min tick of reality; manual overrides never clobbered; provider outage ⇒ stale labels, no crashes, manual mode still works.
- **Risks**: 5-min cron = "live-ish" not minute-by-minute (acceptable v1; DO alarm or 1-min trigger later); provider team/competition ID mapping; free-tier rate limits; postponements/rescheduling edge cases.

### Phase 5 — matchday sharing + notifications
- **Files**: share components in showcase-cannon (match card, my prediction, fan gauge, take of the day, player spotlight) using QrShareSheet (heed the QrShareSheet-React gotcha in memory) + `navigator.share` + copy-link; deep-link handling; intent declarations in `state.ts`/`shippie.json` + `ALLOWED_ORPHAN_PROVIDERS` whitelist + broadcast calls; `.ics` fixture download.
- **Schema**: none.
- **Tests**: intent-graph test green; deep-link render tests; share payload snapshot tests.
- **Acceptance**: every hero surface has a one-tap share producing a Cannon-branded card + `/cannon?…` deep link with correct OG basics; intents visible in app detail capabilities; calendar reminder works offline.
- **Risks**: push **send** pipeline doesn't exist platform-wide — kickoff push is scoped out until that lands (.ics + Dock Updates as interim); per-match dynamic OG images need route work (defer; static Cannon OG image first).

### Phase 6 — polish, tests, production smoke
- `bun run health` (26 typecheck / tests / 24 build); Playwright dev-verify flow (magic-link `/tmp/main-dev.log`, local D1 admin grant, port 4101, via bun); full prepare:showcases → build → deploy; prod smoke: `/cannon`, subdomain, feeds GET, terrace post/vote/report, gauge, offline reload, share links unfurl; bundle/fonts audit; a11y pass (contrast on gold-on-cream micro-labels, focus states, reduced-motion).
- **Acceptance**: all green at HEAD; runbook updated; memory updated.

---

## 7. Open questions

1. Feeds POST auth from a script — admin session vs token? (Phase 3 dependency.)
2. Push send pipeline timeline (platform-wide; Cannon is just a consumer).
3. Per-match dynamic OG images — worth a platform route, or static app OG forever?
4. Keep `lifecycle: "manual"` + custom sw.js, or adopt wrapper `/__shippie/sw.js`? (Custom sw is honest network-first and works today; revisit only if precache from `/__shippie/assets.json` is wanted.)
5. Does Terrace need its own DO for true real-time during matches, or is 15s polling enough? (Polling first.)
