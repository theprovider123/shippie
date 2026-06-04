# Shippie Games — retention spine + collection hubs (strategy/design)

**Date:** 2026-06-04
**Status:** Design, pending implementation plan(s)
**Primary objective:** Retention / daily habit — get people opening Shippie games every day.

---

## 0. Product decision (read this first)

**Hubs are collections + a shared retention spine — NOT replacements for per-game apps.**

Every game keeps its own identity: its own app, subdomain, catalog/search card, SEO, and PWA install. We are consolidating the **spine** (a shared kit + a cross-game streak + two collection surfaces), not destroying per-game surfaces. "Consolidate aggressively" = one kit, two retention hubs, and killing *duplicate* code — it does **not** mean collapsing 17 tiles into 2.

This resolves the discovery risk: the catalog still shows every game; Daily and Arcade appear as **collections** layered over them.

---

## 1. Why this, grounded in what exists

- ~21 standalone games (arcade, daily-puzzle, strategy, party), all `category: 'games'` in `apps/platform/src/lib/container/state.ts`, each an offline-first PWA on its own subdomain.
- **Two hub precedents already shipped:** Golazo (8 football mini-games + bracket/sweeps/live/news, games-first nav) and `daily-puzzle` (Number Trail + embedded Sudoku/Memory/Reaction with a combined streak). The pattern is proven twice.
- **The gap is the spine:** both hubs reinvent registry/leaderboard/share/streak independently; only 2 of ~21 games can share (text-only); ~half the action games lack a daily seed; streak logic is copy-pasted ~3×; the embedded puzzle copies inside `daily-puzzle` are *weaker* than their standalone twins.

So the work is: extract a shared spine, prove it on real games, then layer two collection hubs and a platform tease.

---

## 2. Architecture

```
PER-GAME APPS (canonical, keep identity)         RETENTION SPINE
  sudoku, five-letter, snake, stack, ...   ──▶   @shippie/arcade-kit
  chess (flagship), docklands (flagship)         (registry, dailySeed, useStreak,
  golazo (football hub)                           shareCard, leaderboard, juice)
        │                                                 │
        ▼                                                 ▼
  catalog cards / subdomains              COLLECTION HUBS (navigation + streak)
  (discovery preserved)                     • Shippie Daily  (streak-and-done)
                                            • Shippie Arcade (beat-your-best)
                                            • Golazo skins the same kit
                                                  │
                                                  ▼
                                       shippie.app/today (cross-hub streak teaser)
```

- **Games** stay the source of truth (the real engines). Hubs **deep-link into** them (or embed the same shared game component), never fork weaker copies.
- **Cross-game streak/profile** lives at the hub/platform layer, aggregating each game's `game.completed` observation (infra already exists).

---

## 3. The shared kit: `@shippie/arcade-kit`

Extracted **from real needs after vertical slices** (see §8), not speculatively. Largely liftable from `golazo/src/lib/`.

### 3.1 Surface
- **Game registry** — data-driven `{ id, name, category, loop: 'daily'|'score', shareEmoji, deepLink, component? }`. (Today: hardcoded ternaries in `Games.tsx`.)
- **`dailySeed(gameId, date)` + `puzzleId()`** — the `djb2 → mulberry32` pattern currently copy-pasted into ~9 games.
- **`useStreak(scope)` + `<StreakBadge>`** — unify 3 duplicated implementations; powers per-game and cross-game streaks.
- **`shareCard({ contract, title, rows|canvas })`** — canvas→PNG via `navigator.share({files})` + clipboard fallback. Highest cross-cutting win (only 2 games share today, text-only).
- **Leaderboard client** (`golazo/lib/leaderboard.ts`) — offline-first, endpoint-optional, timeout-guarded. See trust tiers §3.3.
- **Challenge/duel link codec** (`#play=` / b64url) — viral "beat my score" with no server.
- **`<JuiceLayer>` + sound bank** (Particles/Shake/`ARCADE_SAMPLES`) — standardize (4 canvases are audio-only; docklands is silent).
- **Phase-2:** deterministic `ghost/replay` recorder; `achievements`.

### 3.2 Versioned daily/streak/share contract (REQUIRED, define before extraction)

Every daily result, streak entry, share payload, and leaderboard row is stamped with:

```ts
interface DailyResultContract {
  gameId: string;          // 'sudoku'
  rulesVersion: number;    // bump when scoring/rules change → old entries don't corrupt new streaks
  contentVersion: number;  // bump when the puzzle/content bank changes
  seedDate: string;        // 'YYYY-MM-DD' at UTC midnight (decided default; one policy, in the kit)
  contentHash: string;     // hash of the actual puzzle/board → detect silent content drift
  payload: unknown;        // game-specific score/grid/replay
  payloadVersion: number;  // share/replay schema version
}
```

- `puzzleId = `${gameId}-${seedDate}-r${rulesVersion}-c${contentVersion}`` — stamped into every persisted attempt + emitted observation (five-letter already does a `-vN` version of this; formalize it).
- **Streak rule:** a streak only counts entries whose `(gameId, rulesVersion)` match the current rules; content refreshes (new puzzle bank) must not retroactively invalidate past streaks. Define the UTC/local day boundary once, in the kit.
- **Share/replay payloads** carry `payloadVersion` so a future hub can still render an old shared link.

### 3.3 Leaderboard trust tiers (define scope up front)

Offline-first scores are trivially spoofable, so classify every number:
- **Cosmetic-local** — personal bests, streaks, daily ribbons. Device-local, never "ranked." Always trusted enough (it's the player's own).
- **Shareable-claim** — challenge/duel links and share cards. Untrusted by construction; framed as "I scored X" not "verified."
- **Syncable-soft** (optional, only if an endpoint exists) — the global board "lights up on top of" the local board (Golazo's model). Treat as **soft/unverified**: rate-limit, sanity-bound (reject impossible scores), and label as community-reported, not authoritative. No anti-cheat beyond bounds-checking in v1; real verification (server replay) is explicitly out of scope.

---

## 4. Shippie Daily — the habit hub (streak-and-done)

Collection over: **sudoku · five-letter · quartet · number-trail · block-drop · memory · reaction · chess-puzzle (new)**.

- **One combined daily set + one streak** ("Today's Daily: 4/7"). `daily-puzzle` already prototypes `longestCombinedStreak` — promote it to the kit.
- Bring every game up to **five-letter's** bar (the reference: daily seed, 30-day archive calendar, streak, emoji share grid, stats).
- **De-dup:** delete the weak embedded Sudoku/Memory/Reaction inside `daily-puzzle`; the hub embeds/links the real engines.

---

## 5. Shippie Arcade — the session hub (beat-your-best)

Collection over: **snake · invaders · bricks · drift · maze · crossing · stack · lustre · bulwark · (docklands flagship deep-link)**.

- **Daily-seed challenge per game** ("Today's Snake") + offline leaderboard + **race-your-ghost** (deterministic seeds make replay cheap) — turns score-attack into a daily return reason.
- High-score profile; surface existing unlock ladders (crossing has 8 unlockable characters but progress is invisible).
- Retrofit daily-seed to the 4 missing it: **stack, invaders, bulwark, docklands**.

---

## 6. Golazo + `/today`

- **Golazo** adopts the kit and gains the meta it lacks: profile/streak, a **daily football challenge**, **games feed the bracket** (earn boost tokens; "Guess the Nation" using your group's opponents), and **live-match tie-ins** (the `feed` is fetched but only powers the You tab — halftime Top Bins, predict-next-scorer). Stays football-specific.
- **`shippie.app/today`** (exists) surfaces the cross-hub streak + "Daily 4/7" + "today's Arcade challenge", deep-linking into the hubs — the platform home becomes the habit trigger.

---

## 7. Flagships

**Chess** and **Docklands** stay first-class standalone apps (deep engines that a flat "Arcade/Daily" tile would undersell) AND appear inside the hubs as deep-linked collection members. Chess gets its daily tactic puzzle surfaced in Daily; Docklands' daily-seed run surfaced in Arcade.

---

## 8. Per-game improvement backlog

Tagged: **[P]** polish/juice · **[R]** retention · **[C]** content · **[S]** system.

### Golazo (8 mini-games)
- TopBins — [R] power-meter/streak mode (8 shots ends fast)
- FreeKick — [P] guided first-shot tutorial (curl-from-swipe is unintuitive)
- KeepyUppy — [P] combo/milestone flair
- PenaltyDuel — [S] rematch loop; fix name-match attribution (fragile)
- PenaltyRoulette — [P] let kicker's corner choice matter (currently pure RNG)
- WhoAreYa / GuessNation — [C] expand thin bank; [P] crest/jersey modes (flag emoji too easy); [S] persist + leaderboard
- Quiz — [P] timer pressure; skippable reveal

### Arcade
- snake — [P] death particles + self-ghost trail
- invaders — [R] add daily-seed; [P] real death-coord particles
- bricks — [P] shatter particles; [C] hand-authored daily layouts
- drift — [P] thrust/explosion particles (vector games live on juice)
- maze — [C] fruit bonuses + multi-maze rotation; [P] ghost-eat flash
- crossing — [R] surface the unlock ladder; [S] share-card
- stack — [R] **daily-seed bag** (genre killer feature); [P] next-queue preview + clear flash
- lustre — [S] board share-card; [C] objective variety in campaign
- bulwark — [P] **wire the dead tutorial** (defined, unused); [R] endless/leaderboard mode
- docklands — [S] integrate SDK sound/observations/daily/share (currently an island)

### Daily / strategy
- sudoku — [R] daily board + streak; [S] save/resume (zero persistence today)
- five-letter — [R] "solved by X%" social proof; always-on streak header
- quartet — [C] content runway (30 puzzles repeat monthly); [P] date-calendar archive
- block-drop — [S] share its deterministic daily (strongest unused hook)
- memory — [R] daily deck + streak; [S] share-card
- reaction — [S] share the 14-day ribbon; [R] play-streak
- chess — [R] **daily tactic puzzle**; [S] local ELO-feel (engine already premium — biggest untapped hook)

---

## 9. Migration (explicit, not hand-waved)

### 9.1 Local data
Each game already owns `localStorage` keys (`shippie:<game>:v1`), some IndexedDB, SW caches, saved progress, and a PWA launch URL. When a game gains the kit or a hub embeds it:
- **Keep the game's own keys canonical.** Kit reads/writes through the contract (§3.2) but does not rename existing keys without a migration shim (precedent: `daily-puzzle` already migrates legacy keys from the standalone apps).
- Provide a one-time **key-migration shim** + graceful fallback (missing/legacy data → treat as fresh, never crash).
- Don't change PWA `start_url` / SW scope without a redirect; preserve installed users' launch path.

### 9.2 Routes / subdomains
- Per-game apps and subdomains **stay** (collections, not replacements) — minimal redirect surface.
- Where a route genuinely moves permanently, use **301/308** (not 302). Reserve **302** strictly for reversible, in-migration states, and say so.
- Hub deep-links resolve to the canonical game route so old links/shares always land correctly.

---

## 10. Sequencing (revised per review — slices before kit)

1. **This strategy doc** (product decision: hubs = collections).
2. **Three vertical slices** to surface real shared needs (avoid the abstraction trap). Concrete picks, chosen to maximize the shared-need surface:
   - **Stack** (canvas arcade) — add daily-seed bag + share-card → exercises seed + score-loop + share.
   - **Sudoku** (daily puzzle) — daily board + streak + save/resume → exercises the contract, streak, *and* local-data persistence/migration (it has zero persistence today, so it's the highest-signal slice).
   - **Golazo / TopBins** (football) — streak mode + share → proves the kit works inside an existing hub.
   (Five-letter is the reference implementation to copy from, not a slice.)
3. **Define the daily/streak/share payload contract** (§3.2) + leaderboard trust tiers (§3.3) from what the slices needed.
4. **Extract `@shippie/arcade-kit`** from the proven slices.
5. **Shippie Daily** collection hub (cross-game streak, daily set, de-dup embedded copies).
6. **Shippie Arcade** collection hub (daily-seed challenges, leaderboard, ghost).
7. **Golazo + `/today`** adopt the kit; `/today` cross-hub streak teaser.
8. **Phase-2:** coins/XP/achievements, ghost/replay, deeper bracket↔games tie-ins.

Each numbered step from 2 onward becomes its own spec → plan → implementation cycle.

---

## 11. Scope boundaries (YAGNI)

- **In v1 core:** streak + share + leaderboard (soft). Per-game daily-seed + the contract.
- **Phase-2 (deferred):** coins/XP/achievements; ghost/replay; server-verified leaderboards; cross-game "Daily Set" combo badge beyond a simple combined streak.
- **Out of scope:** real anti-cheat (server replay validation); rewriting deep flagships (Chess/Docklands) into hubs; touching drawing-telephone (mesh party — different model, stays separate).
