### showcase-chiwit (flagship)

**Stack:** kit-v2 (OnboardingFlow, IntentToastHost, KeepsakeRenderer, QrShareSheet, BackupCard, EmptyState); `@shippie/backup-providers` AES-256-GCM; Fraunces + JetBrains Mono on sage-cream; App.tsx ~1367 lines.
**Summary:** Ambient wellness pulse — 6 cross-app intents fill a day; honesty-gated overall pulse (null with <3 logged factors); weekly contour keepsake PDF.

**Current strengths:**
- Pulse maths is honest — unlogged factors render at calm baseline (45) without inflating the overall score (App.tsx:336–400).
- Intent pipeline is well-architected: adapter bridges SDK per-kind subscribers onto the kit callback; AMBIENT_BY_KIND maps kind→signal+icon+label without duplication (App.tsx:495–516, IntentMatchers.ts:40–132).

**UI polish:**
- `.factor-helper` (line 1143) renders at body font-size in patterns view; downsize to 0.75rem + wrap in `<em>` for italic-hint tone.
- `.pulse-factors span.is-unlogged` shares colour with logged factors (line 1314); switch to `opacity: 0.4` or muted bar fill.
- Timeline month scrubber (line 1217) lacks keyboard focus ring; add `outline: 2px solid var(--sage)`.

**UX flow:**
- Quick-log pills (App.tsx:937) auto-generate from QUICK_ACTIONS but units aren't shown inline before commit — add "boosts Foundations by ~12%" subtitle.
- Track view (App.tsx:979) has no "repeat tomorrow" affordance; recurring habits require re-entry.

**Feature additions:**
- Insight expansion — only 4 types today (hydration low, movement steady, mood/energy pair, checkin seed). Add streak detection ("3 days ≥ 70 pulse"), consistency milestones, cross-app insights ("Coffee intents cluster in morning — cortisol correlation?").
- CSV export for Apple Health / Google Fit (data export panel says "no cloud" but doesn't offer file download).
- WeeklyShape keepsake — optional "Include notes as footnotes" toggle so shared weeks can carry mood context.

**Cleanup / tightening:**
- UNLOGGED_FACTOR_VALUE = 45 is referenced 4× (App.tsx:86); add a comment explaining why 45 over 50 (calm baseline, never feeds overall pulse).

---

### showcase-recipe (flagship — Palate)

**Stack:** kit-v2 (OnboardingFlow, IntentToastHost, QrShareSheet, BackupCard, EmptyState); `@shippie/local-db` encrypted backup; proximity + cook-along peer-sync (CookAlong.tsx); App.tsx ~2048 lines.
**Summary:** Cook-with-me proximity hero; pantry/plan/shop with location badges + meal-type colour + aisle grouping; sage-tile RecipeSheet; cook-recap keepsake; pass-the-phone QR handoff.

**Current strengths:**
- Pantry/Plan/Shop pipeline is elegant — `planShopping()` dedupes by normalised name, respects stocked items, groups via SHOP_AISLES regex (App.tsx:46–51, 420–439).
- For-you ranking (App.tsx:579) combines planned (+80) + pantry feasibility (0–40) + meal-of-day fit (+15) + personal-fit tiebreak; exposes `pantryFraction` for the hero "8/10 ready" copy (line 1116).

**UI polish:**
- Taste board "Flavour notes" (App.tsx:1222) lists ingredients unsorted; compute a `flavorProfile` ordered by ingredient tags / frequency.
- Recipe tiles show cook-count badge but no "last cooked" date (App.tsx:1154); add `<small>Last cooked: ...</small>`.
- Shopping-list checked items stay full-opacity (App.tsx:790); add `.shopping-item.checked { opacity: 0.5; text-decoration: line-through; }`.

**UX flow:**
- Recipe import sheet (App.tsx:1347) is modal-only without a text-paste fallback; add a `<textarea>` that runs `parseRecipeText` (already imported, line 26).
- Cook-along has no "Invite to cook together" affordance from Cook Mode; add a `Sync with {peerName}` button when `useCookAlongPeer` detects a peer.
- CookRecap modal (App.tsx:1016) blocks re-cook; add a `Cook again` button that closes the recap and re-opens cook mode.

**Feature additions:**
- Aisle grouping (App.tsx:46) is hardcoded regex; move to data file, add Bakery/Meat/Wine/Condiments, allow user "Save my store layout".
- Recipe notes are plaintext only; allow `{ id, photoUrl, caption }` so substitutions can include a photo.
- Meal plan doesn't track actual meal count (breakfast/lunch/dinner vary); add "Servings served this week" + leftover tracking.

**Cleanup / tightening:**
- **App.tsx is 2048 lines.** Extract TodayView, CookbookView, PlanView, PantryView, ShoppingView into own files; move utilities (splitLines, formatQuantity, normaliseName) to a separate module.
- Wire CookRecapSheet to `KeepsakeRenderer` — currently a custom sheet, but the other flagships use the kit primitive.

---

### showcase-match-room (flagship)

**Stack:** kit-v2 (OnboardingFlow, IntentToastHost, QrShareSheet, BackupCard, EmptyState); `@shippie/proximity` + `@shippie/spaces`; KeepsakeRenderer (full-time programme); i18n + timezone detection; App.tsx ~596 lines + 33 component files.
**Summary:** Full-bleed scoreboard hero. Presence ribbon, poll-close fanfare (confetti + flash + haptic), peer-consensus buzzer (floor(N/2)+1), MVP, sweepstake, full-time programme keepsake, QR-first join, encrypted per-room backup. 6 room templates.

**Current strengths:**
- Presence ribbon synthesises peer count → initials + team colour without requiring a named roster up front (PresenceRibbon.tsx:22) — instant join.
- Buzzer fairness (App.tsx:57, `isPeerLocked`) closes the poll when floor(N/2)+1 peers have voted; stragglers can't shift consensus after.

**UI polish:**
- Backup Cards section dominates landing page for users with 5+ saved rooms (line 416); move into a "Data" drawer with summary line.
- Hero scoreboard hardcoded to OPENING_FIXTURE (App.tsx:315); add a fixture selector so the host can toggle which match is "live" in the room.
- Room cards show KICK-OFF + TEMPLATE but no peer count (line 366); add `{peerCount} players` with a live-update pulse if the room is active.

**UX flow:**
- ProfileSettings opens inline with no `Esc`/close button (App.tsx:317); add an `aria-label="Close settings"` button and keyboard handler.
- JoinForm has no path to browse public rooms (App.tsx:347); add a "Browse public rooms" tab (forward-compat for shared room directory).

**Feature additions:**
- Open-ended polls — `poll.type: 'open'` with a text-input sheet for free-form answers (current types are yes/no + predictions).
- Photo/GIF support in shoutouts (App.tsx:348); `{ caption, photoUrl }`.
- MVP voting (App.tsx:349) is peer-consensus only; add host override + tiebreak rule.

**Cleanup / tightening:**
- `presencePeers` useMemo (HostMatchday.tsx:80) rebuilds on every prop change even when peer names don't change; stabilise via ref or trim dep array.
- **CURRENT_STATE outstanding:** wire HostMatchday to emit `kickoff-soon` ~10 min before OPENING_FIXTURE.kickoff so WCF's forward-compat matcher activates.

---

### showcase-world-cup-fantasy (flagship)

**Stack:** kit-v2 (OnboardingFlow, IntentToastHost, KeepsakeRenderer, BackupCard); CouchLeague.tsx (signed-fragment QR handoff); encrypted league + squad backup; live scoring from snapshots (fantasy-engine.ts); App.tsx ~702 lines.
**Summary:** 15-player squad builder for 8-person league. Captain + chips, peer-to-peer standings, pass-the-phone QR with signed league context, tournament programme keepsake.

**Current strengths:**
- Squad validation (App.tsx:665) is exhaustive — budget cap, 2/5/5/3 position limits, 3-per-team rule, 15-total — checked upfront so the UI never shows invalid state.
- Auto-pick uses projected value/price ratio under budget + constraint solver (App.tsx:579) — produces a legit starter, not a toy.

**UI polish:**
- Pitch formation (App.tsx:349) shows surname + price only; add a form-trend icon (📈/📉) and surface `player.note` as a strikethrough or warning colour.
- Leaderboard (App.tsx:487) shows `#{index + 1}` so ties become consecutive numbers; compute `rank = leaderboard.filter(e => e.score > entry.score).length + 1` so tied managers share a rank.
- Market section (App.tsx:558) has no sort order — add Price ASC/DESC, Projected ASC/DESC, Form toggles above each position group.

**UX flow:**
- Picking a player in market doesn't scroll-to-highlight on the pitch; add `scrollIntoView` on the new pitch card.
- CouchLeague auto-opens on QR-fragment present but doesn't surface confirmation copy (line 583+); show banner "League: {leagueName} · Your slot: {currentSlot + 1}/N".
- "Pass to next manager" requires explicit Share tap; add a one-tap `📱 Pass phone to next manager` that increments slot + shows the new QR inline.

**Feature additions:**
- Live scoring (App.tsx:118) only pulls from LIVE_SNAPSHOTS fixture data; expose a Settings panel `Data source: Demo / ESPN / …` for future integrations.
- Captain log (App.tsx:291) shows totals but no drill-down to scoring events; add `captain.events: [{ minute, action, points }]` + timeline.
- Chip strategy (App.tsx:523) shows 3 chips with no explanation; add a `<details>` drawer + auto-recommend ("You have 3 under-performers — Wildcard now").

**Cleanup / tightening:**
- `validateSquad` returns `'Ready to share…'` while the league isn't locked (App.tsx:679); change copy or gate behind `league.locked`.
- IntentMatchers.ts:40–42 registers both `match.kickoff-soon` and `kickoff-soon`; document the forward-compat naming convention (link to spec §7.6 + Brief D).

---

### Cross-flagship observations

1. **Kit-v2 integration is solid** — all four ship the full skin block; no missing-skin bugs.
2. **Intent maturity varies** — chiwit has the most sophisticated matcher (6 kinds, AMBIENT_BY_KIND, legacy fallback); match-room and WCF have minimal matchers (1 each, forward-compat). Document naming convention (hyphenated + dot-namespaced) in each IntentMatchers.ts header.
3. **State management is idiomatic** — useState + useMemo + localStorage; no Redux/Zustand/Jotai needed at this scale.
4. **Recipe architecture is the outlier** — 2048-line App.tsx with inline view components; everyone else is modular.
5. **Test coverage** — match-room is the best-covered (10 test files); chiwit/recipe/WCF have 1 each. Add unit tests for state transitions + intent handling on the lighter-covered flagships.
6. **Keepsakes** — Recipe still ships a custom CookRecapSheet (line 1017) instead of KeepsakeRenderer; align with the kit primitive for consistency.
7. **Match Room → WCF intent emission** — outstanding. Wire HostMatchday.tsx to broadcast `kickoff-soon` ~10 min before kickoff so WCF's matcher activates.
