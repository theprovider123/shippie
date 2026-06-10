# The Cannon — Arsenal Fan OS · Build Plan (2026-06-10)

Design source of truth: `~/Documents/Arsenal Fan App/` (cannon-*.jsx + The Cannon.html + final screenshots).
Five screens: ORACLE (home) · TERRACE · GAUGE · FIXTURES · CLUB. The earlier prompt's Emirates screen and
journal were dropped in the final design and are not built.

## 1. Architecture Decision

- **Worker topology:** no standalone Worker. Cannon ships as a first-party showcase app baked into the
  platform Worker (golazo precedent). `cannon.shippie.app` 302s to `shippie.app/run/cannon` via the
  existing first-party subdomain handler — zero routing work.
- **D1:** shared `shippie-platform-d1`, tables prefixed `cannon_`, migration `apps/platform/drizzle/0060_cannon.sql`.
- **KV:** none needed for v1 (vote dedup and aggregates are relational → D1). CACHE stays available for
  hot-path caching later.
- **Sessions/handles:** platform sessions are never exposed to apps. Identity = client-generated anon UUID
  (`cannon_anon`) + handle from the prefix/suffix pools, persisted in localStorage, sent with writes —
  the production golazo `playerKey` idiom. Server validates handle shape against the pools.
- **Cloudlet:** not applicable (public community app, not a private instance).
- **Intents:** declared in shippie.json (`provides: live.event.v1`), not wired (out of scope).

## 2. Project Structure

```
apps/showcase-cannon/
  index.html               — entry, fonts preload, manifest link, SW register
  package.json             — @shippie/showcase-cannon, vite/react/vitest
  tsconfig.json
  vite.config.ts           — base "./", port 5256, vitest jsdom
  shippie.json             — slug cannon, curation sports, lifecycle manual
  public/
    icon.svg               — cannon mark on red
    icon-192.png, icon-512.png
    manifest.webmanifest   — standalone, theme #EF0107, bg #F8F4EE
    sw.js                  — network-first HTML, cache-first hashed assets
    fonts/*.woff2          — Playfair Display, Barlow Condensed, Inter (self-hosted; CSP blocks Google Fonts)
  src/
    main.tsx               — manual boot (golazo idiom)
    App.tsx                — tab state, screen switch, shell
    styles.css             — :root tokens, app-shell, nav, pills, phone-frame desktop presentation
    lib/types.ts           — Take, Fixture, Player, GaugeState…
    lib/handle.ts          — pools, getHandle(), getAnonKey()
    lib/tz.ts              — TZ_OPTIONS, detectTZ(), localiseMatchTime()
    lib/heat.ts            — heat derivation from vote counts
    lib/api.ts             — takes/votes/gauge client; platform API → localStorage last-good → seed
    data/{fixtures,h2h,squad,trophies,recent,oracle,takes-seed}.ts
    components/{CannonLogo,StatusBar,BottomNav,ScreenHeader,Divide,TimezonePicker,TakeCard,GaugeDial,Heatmap,FixtureRow,PlayerMini}.tsx
    screens/{HomeScreen,TerraceScreen,GaugeScreen,FixturesScreen,H2HView,ClubScreen,PlayerDetail,SeasonStats}.tsx
    app.test.tsx + lib/*.test.ts

apps/platform/
  drizzle/0060_cannon.sql
  src/routes/api/cannon/takes/+server.ts  (+ server.test.ts)
  src/routes/api/cannon/votes/+server.ts  (+ server.test.ts)
  src/routes/api/cannon/gauge/+server.ts  (+ server.test.ts)
```

## 3. D1 Schema (0060_cannon.sql)

```sql
CREATE TABLE cannon_takes (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  thread TEXT NOT NULL DEFAULT 'MATCH',          -- MATCH | ANALYSIS | HISTORY
  text TEXT NOT NULL,                            -- <= 280 chars
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX cannon_takes_created_idx ON cannon_takes (created_at DESC);
CREATE INDEX cannon_takes_thread_idx  ON cannon_takes (thread, created_at DESC);

CREATE TABLE cannon_votes (
  take_id TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  dir INTEGER NOT NULL,                          -- 1 | -1
  created_at INTEGER NOT NULL,
  PRIMARY KEY (take_id, anon_key)
);

CREATE TABLE cannon_gauge (
  match_id TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  rating INTEGER,                                -- 1..10
  mood TEXT,                                     -- buzzing|relieved|anxious|frustrated
  moment TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, anon_key)
);
```
Seeds: the 7 design takes (fixed ids `seed-1..7`, design vote counts, staggered created_at);
gauge baseline for `arsenal-newcastle-2026` matching the design read (avg 7.4, mood split 38/29/22/11).

## 4. API Contract

- `GET  /api/cannon/takes?thread=MATCH&anonKey=…` → `{ takes: [{id,handle,thread,text,up,down,createdAt,myVote}] }` (50 newest)
- `POST /api/cannon/takes {handle,anonKey,thread,text}` → created take. Rejects empty/`>280` text, bad
  thread, handle not from pools; 30s per-anonKey cooldown.
- `POST /api/cannon/votes {takeId,anonKey,dir:'up'|'down'|null}` → `{up,down,myVote}`. Upsert/flip/clear
  via D1 batch; counters recomputed from the votes table (no drift).
- `GET  /api/cannon/gauge?match=…&anonKey=…` → `{avg,count,moods:{…},mine:{rating,mood,moment}}`
- `POST /api/cannon/gauge {matchId,anonKey,rating?,mood?,moment?}` → upsert (partial: never clobbers
  other fields). Rating bounds 1–10.
All CORS-open like `/api/golazo/scores`.

## 5. Out of Scope (stubs only)

MatchRoom DO · AI-generated Oracle (static copy) · OG share cards · second club instance ·
intent wiring · crowdsourced anything. Multi-club readiness = semantic CSS tokens + data modules only.

## 6. Verification gates

1. `bun run health` green (typecheck + vitest + build) — includes new route tests + showcase tests.
2. Local: migrate local D1, platform dev :4101, Playwright sweep at 390×844 and 1440×900 — screenshot
   all screens + drill-downs against `~/Documents/Arsenal Fan App/0?-final.png`, exercise vote flip,
   rating select/clear, compose, month filter, H2H back, player back, offline fallback.
3. Deploy: re-sync with feat/dock-harmonization HEAD, merge, remote migration 0060, platform deploy,
   live smoke on cannon.shippie.app (+ PWA manifest + API round-trip).
