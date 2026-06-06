# Golazo → "Your Call" Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Golazo showcase into the "Your Call" experience from the build prompt — British-pub banter throughout, four-tab IA (Play / Tips / Your Lot / You), three screenshot-worthy share cards, reactions + tribe stats, new pub games, and a Cloudflare OG-image route for native chat unfurls — while keeping Golazo's established stadium-green identity and Shippie's offline-first, no-login ethos.

**Architecture:** Vite + React 18 SPA, offline-first, localStorage-backed (`src/lib/storage.ts`), share-by-link via compact base64url codecs (`src/lib/codec.ts`, `games.ts`, `duel.ts`). Pure logic lives in `src/lib/*` with vitest coverage; UI in `src/components/*`; the full skin in `src/styles.css`. A companion Cloudflare Worker route under `apps/platform` (sibling to the existing `/api/golazo/scores`) renders OG PNGs for link unfurls. No backend user data; pools/tips are local + link-synced.

**Tech Stack:** React 18, TypeScript, Vite, vitest, Canvas2D (offline share cards), Cloudflare Worker + satori + @resvg/resvg-wasm (OG route). `bun run typecheck && bun run test && bun run build` is the green-light gate (run from `apps/showcase-golazo`).

**Design decisions (locked with user 2026-06-06):**
1. **Evolve Golazo identity** — keep wordmark "Golazo", palette `--brand:#16F08B` / bg `#06140F`, current font stack. Do NOT adopt `#00E87A` / "Your Call" rebrand / Bebas Neue. Apply the prompt as *copy + structure + feature* intent, not visual rebrand. The card *layouts* (My Call / Receipts / Outside Bet) are adopted, re-skinned to Golazo green.
2. **Share cards = both** — keep instant offline Canvas2D cards AND add a CF Worker OG route (`/api/golazo/og`) for WhatsApp/iMessage unfurls. Graceful if the route is absent (offline ethos).
3. **Everything, in slices** — full prompt scope, commit per slice on branch `golazo-next-level`.

**Vocabulary map (apply everywhere — UI, empty states, copy):**
`bracket`→`my call`/`your call`; `pool`→`your lot`/`the group`; `picks`/`predictions`→`tips`; `dark horse`→`outside bet`; `predictions locked`→`tips in`; `matchday`→`match week`; `knockout stage`→`the knockouts`; `group stage`→`the groups`; `global leaderboard`→`everyone playing`; humiliation→`the receipts`. Tone: British pub, dry, specific banter ("Jordan picked Japan. Jordan is 4th."), positive = "Called it.", negative = "Bottled It 💀", CTAs = actions ("Drop in the group chat"), empty states have personality ("No tips yet. Scared?").

---

## File Structure

**New files**
- `src/lib/reactions.ts` — reaction model (🔥📞💀), 24h expiry, per-pool-entry storage. (pure, tested)
- `src/lib/reactions.test.ts`
- `src/lib/tribe.ts` — tribe-stat derivations ("top X% of England fans", "X others picked Saudi", "only N% called this") from pool entries + results. (pure, tested)
- `src/lib/tribe.test.ts`
- `src/lib/receipts.ts` — "most wrong" callout + per-entry tags (Called It / Bottled It / On Fire / Silent) from scores. (pure, tested)
- `src/lib/receipts.test.ts`
- `src/lib/outsidebet.ts` — Outside Bet Roulette spin (seeded random nation from remaining field) + outside-bet scoring/landed detection. (pure, tested)
- `src/lib/outsidebet.test.ts`
- `src/lib/manager.ts` — Manager Mode: budget XI selection + scoring model + link codec. (pure, tested)
- `src/lib/manager.test.ts`
- `src/lib/locktimer.ts` — countdown-to-lock helper ("Tips lock in 2d 14h 32m") + locked() predicate. (pure, tested)
- `src/lib/locktimer.test.ts`
- `src/components/games/OutsideBetRoulette.tsx`
- `src/components/games/ManagerMode.tsx`
- `src/components/games/CardHappy.tsx`
- `src/components/games/ThatsNeverAPen.tsx`
- `src/components/PubNight.tsx` — Pub Night Mode toggle + context.
- `src/components/Profile.tsx` — the "You" tab hub (name/nation/streak/stats/timeline/settings).
- `apps/platform/.../routes/api/golazo/og/+server.ts` (exact path resolved in Slice 8) — OG PNG endpoint.

**Modified files**
- `src/components/BottomNav.tsx` — labels Tips / Your Lot (ids unchanged to limit churn).
- `src/lib/sharecard.ts` — three new card renderers (My Call commitment, The Receipts, Outside Bet badge) re-skinned to Golazo green.
- `src/components/MyCall.tsx` — Tips tab: groups + knockouts copy, lock countdown, outside-bet pick, "My Call" share CTA on completion.
- `src/components/Pools.tsx` — "Your Lot": reactions row, tribe stats, receipts banner, scarcity invite framing.
- `src/components/Games.tsx` — register new games, Pub Night Mode toggle, Top Bins comment line.
- `src/components/games/TopBins.tsx` — one-line dry comment per attempt.
- `src/data/trivia.ts` — extend question bank for Who Are Ya? (optional, additive).
- `src/state.tsx` + `src/lib/storage.ts` + `src/lib/types.ts` — reactions state, outside-bet pick, pub-night setting, profile streak/stats.
- `src/styles.css` — skin for all new components (cards, reactions, receipts, tribe, pub-night, profile).
- `src/App.tsx` — wire Profile tab, Pub Night provider.
- `shippie.json` / `index.html` / manifest — PWA polish, banter meta (kept as Golazo).

---

## Slice 1 — Vocabulary + nav + copy overhaul

### Task 1.1: Rename nav labels

**Files:** Modify `src/components/BottomNav.tsx`

- [ ] Change label `"Picks"` → `"Tips"` (id `predict` unchanged); label `"Mates"` → `"Your Lot"` (id `pools` unchanged). Keep `Play` and `You`.
- [ ] Run `bun run typecheck` → clean.
- [ ] `bun run test` → 66 pass (app.test asserts nav; update any label assertion there if present).

### Task 1.2: British-banter copy sweep

**Files:** Modify `src/components/{Games,MyCall,Pools,GroupStage,BracketView,Onboarding,Sweepstakes,IncomingShare,IncomingSweep,Live}.tsx`

- [ ] Replace jargon per the Vocabulary map. Specific high-value strings:
  - Games intro → "Quick footy games. No login — your bests live on this phone. Challenge a mate by link."
  - Empty boards → "No tips yet. Scared?" / "No scores yet — go on then."
  - Bracket/knockout headings → "Your Call" / "The Knockouts" / "The Groups".
  - Pool/Mates copy → "Your Lot" / "the group".
  - "Dark Horse" → "Outside Bet" everywhere.
  - CTAs → "Drop in the group chat", "Flex on your lot".
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): four-tab rename (Tips/Your Lot) + British-banter copy sweep`

---

## Slice 2 — Three share cards (offline Canvas2D, Golazo-skinned)

Adopt the prompt's three card *layouts*, rendered on Canvas at story size `1080×1920` (and `og` 1200×630 where it makes sense), tinted with Golazo green `#16F08B`/`#58f0a8` and team accents. Reuse existing `roundRect`, `hexA`, `FONT` helpers in `sharecard.ts`.

### Task 2.1: My Call (commitment) card — upgrade `drawCard`

**Files:** Modify `src/lib/sharecard.ts`

- [ ] Restructure `drawCard` to the commitment layout: eyebrow badge `GOLAZO · 2026 WORLD CUP CALL`; "MY WINNER IS" + champion flag + name + 🏆; a 2×2 picks grid (Outside Bet 🌶️ / Golden Boot / Group winner / First Upset — pull from `prediction`); a "Spicy Take" band (derive a stock line if none); footer "Locked by {name}" + url. Keep `story` + `og` formats.
- [ ] Manual verify via a tiny harness route (`#demo` already simulates) or unit-snapshot of canvas dimensions only (canvas pixels not asserted; keep `golazo.test.ts` accentFor test green).
- [ ] `bun run typecheck && bun run test && bun run build` → green.

### Task 2.2: The Receipts (result) card — new `drawReceiptsCard`

**Files:** Modify `src/lib/sharecard.ts`

- [ ] Add `export interface ReceiptsCard { matchLabel: string; home: {short;flag;score}; away: {short;flag;score}; rows: {pos;initial;name;tag?;pts;you?;accent}[]; callout: string; poolName: string; players: number }` and `drawReceiptsCard(canvas, c)` rendering: match score box, pool table (gold/silver/bronze positions, YOU highlight, "Bottled It 💀" tag in red), receipts banner (📞 + callout), footer. Add `receiptsCardBlob`.
- [ ] `bun run typecheck && bun run test && bun run build` → green.

### Task 2.3: Outside Bet badge card — new `drawOutsideBetCard`

**Files:** Modify `src/lib/sharecard.ts`

- [ ] Add `export interface OutsideBetCard { teamId; qualifier; pctCalled; oneIn; bonus; playerName }` and `drawOutsideBetCard(canvas, c)`: gold/amber glow, big flag, team name in gold gradient, qualifier line, 3-stat row (% called / 1-in-N believers / +bonus pts), "{name} saw it coming." CTA, footer. Add `outsideBetCardBlob`.
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): three share cards — My Call, The Receipts, Outside Bet badge`

---

## Slice 3 — Reactions (🔥📞💀) + The Receipts in Your Lot

### Task 3.1: Reactions model (TDD)

**Files:** Create `src/lib/reactions.ts`, `src/lib/reactions.test.ts`

- [ ] Test first:
```ts
import { describe, it, expect } from "vitest";
import { addReaction, activeReactions, type ReactionStore } from "./reactions";

const NOW = 1_700_000_000_000;
describe("reactions", () => {
  it("adds a reaction keyed by entry uid", () => {
    const s = addReaction({}, "abc", "fire", NOW);
    expect(activeReactions(s, "abc", NOW)).toEqual(["fire"]);
  });
  it("expires reactions after 24h", () => {
    const s = addReaction({}, "abc", "skull", NOW);
    expect(activeReactions(s, "abc", NOW + 24 * 3600_000 + 1)).toEqual([]);
  });
  it("dedupes the same reaction, keeps newest timestamp", () => {
    let s: ReactionStore = addReaction({}, "abc", "phone", NOW);
    s = addReaction(s, "abc", "phone", NOW + 1000);
    expect(activeReactions(s, "abc", NOW + 2000)).toEqual(["phone"]);
  });
});
```
- [ ] Run → FAIL. Implement `ReactionKind = "fire"|"phone"|"skull"`, `ReactionStore = Record<uid, {kind;at}[]>`, `addReaction`, `activeReactions` (filter < 24h). Run → PASS.

### Task 3.2: The Receipts model (TDD)

**Files:** Create `src/lib/receipts.ts`, `src/lib/receipts.test.ts`

- [ ] Test first: given pool entries with scores, `tagFor(entry, ranked)` → "called"|"bottled"|"fire"|"silent"|null and `mostWrong(entries, results)` → the entry+reason for the receipts banner. Assert: bottom scorer with a clearly-wrong group-winner pick is flagged; an un-tipped entry → "silent". (Write 3 concrete cases.)
- [ ] Run → FAIL → implement using existing `scoring.ts` (`scorePrediction`) → PASS.

### Task 3.3: Tribe stats (TDD)

**Files:** Create `src/lib/tribe.ts`, `src/lib/tribe.test.ts`

- [ ] Test first: `tribeStats(myPrediction, allEntries)` → array of lines like `{ pct: 8, label: "called Saudi Arabia as their outside bet" }`; "only N% called {result}" given results. Assert percentages computed correctly from entries; never shows raw rank. (3 cases.)
- [ ] Run → FAIL → implement → PASS.

### Task 3.4: Wire reactions + receipts + tribe into Your Lot UI

**Files:** Modify `src/components/Pools.tsx`, `src/state.tsx`, `src/lib/storage.ts`, `src/lib/types.ts`, `src/styles.css`

- [ ] Add `reactions: ReactionStore` to store with `react(uid, kind)` action; persist via storage (`loadReactions`/`saveReactions`).
- [ ] In a pool's entries list: tap a row → reveal 🔥📞💀; show active reaction badges; show per-entry tags from `receipts.ts`; show a Receipts banner from `mostWrong`; show tribe-stat lines from `tribe.ts`.
- [ ] Add scarcity invite framing copy ("Your Lot is filling up — 2 spots left") on the invite affordance.
- [ ] Add a "Share The Receipts" button → `receiptsCardBlob` web-share/download.
- [ ] Skin all new classes in `styles.css` (Golazo green).
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): reactions, tribe stats + The Receipts in Your Lot`

---

## Slice 4 — Tips tab: lock countdown, outside-bet pick, My Call CTA

### Task 4.1: Lock timer (TDD)

**Files:** Create `src/lib/locktimer.ts`, `src/lib/locktimer.test.ts`

- [ ] Test first: `lockCountdown(kickoffMs, nowMs)` → `{ locked: false, text: "2d 14h 32m" }` and `{ locked: true, text: "Tips in" }` once past kickoff. Edge: <1h shows "Xm". (3 cases.)
- [ ] Run → FAIL → implement (tournament kickoff from `tournament.ts` or a constant) → PASS.

### Task 4.2: Wire Tips tab

**Files:** Modify `src/components/MyCall.tsx`, `src/components/GroupStage.tsx`, `src/lib/types.ts`, `src/state.tsx`, `src/styles.css`

- [ ] Add `outsideBet?: string` to `Prediction` + `setOutsideBet` action + storage migration (default undefined; bump `SCHEMA_VERSION` only if needed, keep back-compat).
- [ ] "The Groups" progress "X of 12 groups tipped"; "The Knockouts" gated until all groups tipped; explicit Outside Bet picker.
- [ ] Lock countdown banner ("Tips lock in 2d 14h 32m") from `locktimer.ts`; read-only after lock.
- [ ] On all-tips-complete, prominent "Share My Call" CTA → `cardBlob`.
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): Tips tab — lock countdown, Outside Bet pick, My Call CTA`

---

## Slice 5 — New games + Pub Night Mode

### Task 5.1: Outside Bet Roulette (TDD logic + UI)

**Files:** Create `src/lib/outsidebet.ts` (+ test), `src/components/games/OutsideBetRoulette.tsx`; modify `Games.tsx`, `styles.css`

- [ ] Test first: `spinNation(seed, field)` deterministic pick from remaining field; `landed(teamId, results)` true if that nation qualified/advanced. (3 cases.)
- [ ] Run → FAIL → implement → PASS.
- [ ] UI: spin animation → assigned nation → immediate shareable "I got Saudi Arabia 😬" card (reuse `drawSweepCard` or `drawOutsideBetCard`).

### Task 5.2: Manager Mode (TDD logic + UI)

**Files:** Create `src/lib/manager.ts` (+ test), `src/components/games/ManagerMode.tsx`; modify `Games.tsx`, `styles.css`

- [ ] Test first: `pickXI(selected, budget)` validates budget + 11 players; `scoreXI(xi, perf)` sums performance points; link codec `encodeTeam`/`decodeTeam` round-trips. (4 cases.)
- [ ] Run → FAIL → implement (player pool can be a small bundled list keyed off `teams.ts` nations; budget abstract) → PASS.
- [ ] UI: pick XI from a fixed budget; share team sheet as a card; H2H by link (reuse hash-codec pattern).

### Task 5.3: Card Happy + That's Never A Penalty (pass-the-phone)

**Files:** Create `src/components/games/CardHappy.tsx`, `src/components/games/ThatsNeverAPen.tsx`; small bundled incident bank in `src/data/trivia.ts` or new `src/data/incidents.ts`; modify `Games.tsx`, `styles.css`

- [ ] Card Happy: show a match incident, players guess yellow/red, closest to real card count wins. Local, no backend.
- [ ] That's Never A Penalty: show a clip description, players vote yes/no, majority wins — "argue about it after" is the feature. Loser/forfeit prompt 🍺.
- [ ] (Logic minimal/UI-driven; if any pure helper emerges, test it.)

### Task 5.4: Top Bins comment line + Pub Night Mode

**Files:** Modify `src/components/games/TopBins.tsx`, create `src/components/PubNight.tsx`; modify `Games.tsx`, `App.tsx`, `state.tsx`, `storage.ts`, `styles.css`

- [ ] TopBins: after each attempt, one dry line — "Post." / "Keeper didn't move." / "That's a goal." / "Row Z." (deterministic by outcome).
- [ ] Pub Night Mode toggle at top of Play: dims screen, mutes sounds (`haptics`/sound off), larger tap targets, higher contrast (body class `pub-night`). Persist setting.
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): new games — Outside Bet Roulette, Manager Mode, Card Happy, That's Never A Pen + Pub Night Mode`

---

## Slice 6 — "You" tab (profile hub)

### Task 6.1: Profile component

**Files:** Create `src/components/Profile.tsx`; modify `App.tsx`, `state.tsx`, `storage.ts`, `types.ts`, `styles.css`

- [ ] Editable name; your nation (flag/group/next-match countdown via `locktimer`); tip streak (days engaged — derive from a persisted `lastActive`/`streak` in storage); your stats (correct tips, outside bets landed, reactions received); mini timeline of correctly-called results; settings (notifications opt-in copy, Pub Night toggle, theme=dark).
- [ ] Replace whatever currently renders for tab `home`/`You` with `Profile`.
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): You tab — profile, streak, stats, timeline, settings`

---

## Slice 7 — Notifications copy + PWA polish

### Task 7.1: Banter notification strings + manifest

**Files:** Create `src/lib/notifications.ts` (string bank, no permission prompt on load); modify `shippie.json`, `index.html`, service-worker/manifest if present, `styles.css`

- [ ] Centralise banter notification copy ("England kick off in 45 minutes. You tipped them to win. No pressure."). Wire opt-in only (no first-load permission request).
- [ ] Manifest: confirm standalone, dark theme, name "Golazo", icon. App shell offline (verify existing SW or note absence).
- [ ] `bun run typecheck && bun run test && bun run build` → green.
- [ ] Commit: `feat(golazo): banter notifications copy + PWA polish`

---

## Slice 8 — Cloudflare OG-image route (native chat unfurl)

### Task 8.1: Locate + scaffold the route

**Files:** Investigate `apps/platform` for the existing `/api/golazo/scores` handler; create sibling `/api/golazo/og`.

- [ ] Find the scores route (grep `golazo/scores`). Mirror its framework (SvelteKit `+server.ts` or Worker handler).
- [ ] Implement `GET /api/golazo/og?type=mycall|receipts|outsidebet&...params` → render PNG via `satori` (JSX→SVG) + `@resvg/resvg-wasm` (SVG→PNG), 1200×630, cache headers. Mirror the prompt's card layouts. Reuse a self-hosted/bundled font (no network at render).
- [ ] Add OG meta tags to the share-link landing so WhatsApp/iMessage unfurl `og:image` → this route. Graceful: app works fully without it.
- [ ] Whitelist any new domain in `shippie.json` `allowed_connect_domains` if needed.
- [ ] Run platform health (`bun run health` at repo root or platform typecheck/test/build) → green.
- [ ] Commit: `feat(platform): /api/golazo/og — satori PNG for native chat unfurls`

---

## Slice 9 — Final verification + screenshots

### Task 9.1: Full green-light, repeated

- [ ] From `apps/showcase-golazo`: `bun run typecheck && bun run test && bun run build` — run **twice**, both fully green.
- [ ] From repo root: `bun run health` — confirm platform unaffected (esp. if Slice 8 touched platform).
- [ ] CDP/Playwright screenshot walkthrough on a mobile viewport: Play hub + each new game, Tips (groups/knockouts/lock countdown), Your Lot (reactions/receipts/tribe), You tab, and each of the three share cards. Eyeball for banter + Golazo skin consistency.
- [ ] Commit: `chore(golazo): verification pass — screenshots + double-green health`

---

## Self-Review

**Spec coverage:** Design system → Slice 1/2 (evolve-identity decision, no rebrand). Language overhaul → Slice 1. Nav → 1.1. Play/games → 5. Tips → 4. Your Lot (reactions/tribe/sweepstake/receipts) → 3. You → 6. Share cards (3) → 2. Viral loops 1–4 → cards (2) + OG route (8) + receipts (3) + outside-bet (2/3/5). Notifications → 7. PWA → 7. OG unfurl → 8. "What this is NOT" (no chat/feed/login/onboarding-carousel/email) → honoured by keeping offline/no-login model; add nothing prohibited.

**Placeholder scan:** Logic tasks carry concrete test code; UI/canvas tasks specify exact structures/strings. Canvas pixels aren't unit-asserted (verified visually in Slice 9) — intentional, matches existing `sharecard` testing approach.

**Type consistency:** `ReactionKind`/`ReactionStore` used consistently (3.1→3.4); `Prediction.outsideBet` defined 4.2 before use in 2.1/3.x; card interfaces defined in 2.x before blob helpers. `cardBlob`/`receiptsCardBlob`/`outsideBetCardBlob` naming consistent.

**Risk notes:** Slice 8 (satori on Workers) is the highest-risk/optional slice — gated to graceful-absence so the app ships without it. `SCHEMA_VERSION` bump (4.2/6.1) must stay back-compatible with existing localStorage payloads.
