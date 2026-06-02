# Golazo — games-first social pivot + game overhaul (2026-06-02)

Approved direction: reposition Golazo to **games + social fun around the World Cup,
no tracking** (no live scores, no team/player data feeds). Overhaul the games (one
realistic shared keeper, flexible+dynamic difficulty, real curl), redesign the
head-to-head as a two-sided **Penalty Duel** (you keep *and* strike), add **pub /
pass-the-phone** games, drop the word "bracket", and evolve (not rebuild) the look.
Offline, no-login, share-by-link. Build in the `golazo-next-level` worktree.

## A. Shared keeper + difficulty — `src/lib/keeper.ts` (test-first)
One believable keeper model used by every shooting game.
- State machine: **idle/patrol → commit (on shot) → dive** toward a guessed point with
  *reach*, *reaction delay*, and *error*; animated dive (lunge + lean), returns to line.
- `keeperConfig(difficulty: number /*0..1*/)` → `{ reach, reactionMs, errorPx, speed }`.
  Casual ≈ 0.3, Pro ≈ 0.8. Higher difficulty = more reach, faster reaction, less error.
- `saved(ballX, keeperX, reach)` pure helper (testable).
- **Dynamic difficulty:** games raise `difficulty` as the score climbs (e.g. +0.06 per
  goal, capped), so it gets harder the better you do. Player also picks **Casual / Pro**.
- Retrofit Top Bins, Free Kick (which currently never dives), and (visual) Penalty to it.

## B. Free Kick — real curl
Curl from the **arc** of the swipe, not its endpoints: sample the pointer path, derive a
signed curvature → a lateral acceleration applied through flight. Pronounced + previewed
(the dotted guide shows the banana). Tune so you can genuinely bend it round the wall.

## C. Penalty Duel — `src/lib/duel.ts` + `components/games/PenaltyDuel.tsx` (test-first)
Two-leg link duel; each player is keeper **and** striker. No seed-keeper, no backend.
- **Leg 1 (A→B):** A takes 5 (placements) **and** sets 5 dives for B. Link `#duel=` carries
  `{ a:{shots,dives}, name }`, `leg:1`.
- **Leg 2 (B→A):** B shoots *vs A's dives*, sets *their* 5 dives. Link carries both legs.
- **Resolve:** A shoots vs B's dives → final. `resolveDuel(aShots,aDives,bShots,bDives)` →
  goals each (a shot is a goal iff its placement zone ≠ the opposing keeper's dive zone and
  it's on target). Level → rematch.
- Codec: compact base64url like the existing share codecs; `readDuelFromHash`.
- Replaces the old seed-based Penalty + `#pk=` (keep a redirect/compat read).

## D. Pub / pass-the-phone games — `components/games/*`
Local, group, evergreen (no data):
- **Penalty Roulette** — group knockout: pass the phone, each takes a pen, a miss
  eliminates you; last standing wins. Configurable player list.
- **Who Are Ya?** — football trivia from a bundled evergreen question bank
  (`src/data/trivia.ts`), pass-the-phone or solo, score out of N.
- **Guess the Nation** — flag/short-code/emoji guess against the teams data; multiple-choice.

## E. Reposition — nav, naming, tracking
- **Nav (Play-first):** **Play · Picks · Mates · You** (Play default landing). "Predict"→
  "Picks"; "Pools"→"Mates" (sweepstake + pools + challenges live here).
- **Drop "bracket":** "your call/picks"; knockout side → **"Route to the Final"**.
- **No tracking:** remove "scores light up / live" copy + results-driven framing. Sweepstake
  **settle becomes manual** ("mark who won the pot"); `#demo` simulate kept for fun.

## F. Look & feel — light evolution (keep identity)
Electric-green stadium identity stays. Home → a big **"what do you want to play?"** hub
(hero game tiles), bigger flags, more arcade motion; extend the stadium backdrop subtly to
hub/Play surfaces. No palette/type rebuild.

## G. Viral + shareable (the growth loop)
Make every game produce a thing worth sending — frictionless because there's no login.
- **A share card for every result** (`src/lib/sharecard.ts` extended, canvas, offline):
  "I scored 47 kick-ups", "I beat Mo 4–3", "Worldie free kick" — team/nation-tinted, with
  the player's name + a **challenge link** baked in. Web-Share files → download fallback.
- **Challenge-link ping-pong** is the loop: every solo result → "Challenge a mate" (link +
  card); the **Penalty Duel** is inherently viral (it *only* progresses by sending links).
- **Rich link unfurls (OG):** a tiny platform route `/api/golazo/og` (or reuse the existing
  card → R2) so a `#duel=`/`#play=` link shared in WhatsApp/Twitter unfurls into a generated
  image ("Mo got 4/5 — can you beat it?"). Deploy-ready, graceful if absent.
- **QR share** (reuse `@shippie/qr`) for in-person / pub passing.
- **Bragging hooks:** "#3 in the world" off the leaderboard; streak/milestone flashes
  ("10 in a row!") that are themselves shareable moments.
- Keep it **one-tap**: tap link → play instantly, no account — the core enabler.

## Testing (run repeatedly)
- Test-first pure logic: keeper save/difficulty curve, duel resolve + codec, trivia scoring,
  nation-guess. `tsc --noEmit` + `vitest run` + `vite build` green per slice, and a final
  **multiple** full-suite runs.
- CDP-driven screenshots: game select, each game (keeper diving, curl), Penalty Duel legs,
  each pub game, reworked Home/nav. Fresh-visit on mobile + a wide desktop viewport.

## Slices (commit per slice, worktree)
1. keeper.ts + difficulty + retrofit keepers; Free Kick real curl.
2. Penalty Duel (logic + codec + UI), retire seed-penalty.
3. Pub games: Penalty Roulette, Who Are Ya?, Guess the Nation.
4. Reposition: nav (Play-first), naming (Picks / Route to the Final), strip tracking,
   manual sweepstake settle.
5. Look & feel: games hub + light evolution.
6. Test multiple times + screenshot walkthrough.
