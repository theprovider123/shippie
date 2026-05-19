# Showcase deep pass — feature, UX & UI proposals

Date: 2026-05-19
Apps in scope: **Palate · Chiwit · Atlas · Coffee · Restaurant Memory · Ledger · Body Metrics · Match Room · World Cup Fantasy**

Grounded against actual `App.tsx` / `shippie.json` state at HEAD. Every proposal references a Shippie primitive (intents, container DB, observations, Sheet, share fragments, feel.texture, wakelock, design tokens). Where a proposal needs a new primitive, it says so explicitly.

---

## Principles applied to every app

1. **Cloudflare-only, local-first.** No new server. Workers + D1 + R2 + KV + Durable Objects are the only backend surface. User data lives on-device.
2. **Standout = one hallmark move.** Per the 4-move design pattern doc, every standout app needs one identity move a teammate can describe in one sentence ("the contact-sheet one", "the gallery one").
3. **Mobile is a phone app, desktop is a workstation.** Mobile = thumb-zone, single-task, swipeable. Desktop = multi-column, keyboard shortcuts, denser tables. Not a stretched mobile layout, not a shrunken desktop one.
4. **Cross-app intents are the moat.** A solo restaurant logger is generic. A logger that auto-feeds Ledger, Atlas and Chiwit is the Shippie product. Every app's roadmap leans into the intent graph.
5. **Keep it simple.** Each app gets one standout feature, not five. The "later" pile is honest, not aspirational.

---

## 1 · Palate (`apps/showcase-recipe/`)

**What it is.** The kitchen monolith — recipes, cookbook, weekly plan, pantry, shopping, cook mode. 6 tabs (`today`/`cookbook`/`plan`/`pantry`/`shop`/`data`). Provides 7 intents, consumes 7. Personal-fit scoring on every recipe.

**Current state.** Single 1400-line `App.tsx` with sub-components inline (`TodayView`, `TasteBoard`, `CookbookView`, `PlanView`, `PantryView`, `ShoppingView`, `DataView`, `RecipeSheet`, `CookMode`). LocalStorage only. `CookMode` has wakelock. Imports `IntegratedTabs.tsx` which references three legacy localStorage keys (`shippie.meal-planner.v2`, `shippie.shopping-list.v1`, `shippie.pantry-scanner.v1`) — migration in flight.

**Standout play: "What's cooking tonight?"** A Today tab that *resolves to a single recipe* by 5pm and walks you into cook mode at 6pm. Right now Today is a generic dashboard. Make it the answer to dinner.

**Feature improvements**
- **Today as a decision, not a dashboard.** Show 1 recipe with a "Cook this" CTA. Computed from: tonight's meal-plan slot, then pantry-feasibility (have ≥80% of ingredients), then personal-fit. Three swipe-alternatives below. Skip → re-rolls.
- **Cook from camera.** Use `Transformers.js` (already proxied via `/__esm/`) to OCR a handwritten or printed recipe into a structured recipe row. Phase 1: photo → text → manual edit. No new server.
- **"Ate this elsewhere" loop.** Listen for `dined-out` (Restaurant Memory). When user eats out, ask: "want to log this so we don't suggest it tomorrow?" Cuts the suggest-the-thing-you-just-ate trap.
- **Plan ↔ Shop is one round trip.** Drag a recipe onto a meal-plan slot → shopping list auto-updates with the delta after subtracting pantry. Today these are separate flows.

**UX — mobile**
- Today tab becomes a single full-bleed recipe card with primary CTA, alt recipes below as a swipeable row. Bottom-tab nav reduces to 4 + More (current is 6 → too many).
- CookMode already has wakelock; add a step-timer ring per step (most recipes have implicit "rest 5 min" buried in prose). Surface them.
- Pantry: barcode scan via `BarcodeDetector` API (no extra deps; Chrome/Edge/Safari support is enough).

**UX — desktop**
- Three-column workstation: Cookbook list | Recipe detail | Plan/Shop drawer. Drag a recipe → drop on a meal-plan day to schedule. Today is wasted screen on desktop.
- Keyboard: `/` focus search, `c` cook now, `n` new recipe, `p` plan view.

**UI**
- The orange (`#D86918`) is good but the cream (`#F4E4C1`) reads dated. Push the cream to the bone tone used in photo-a-day's identity pass (`#F2EDDE`) for warmth without saturation.
- Recipe tiles: photo top, title in Fraunces serif, ingredients-have-you-got? badge bottom-right (e.g. "8/10 ready"). That badge is the pantry-intersection signal and is the most useful thing on the tile.

**Infra leverage.** Intent graph (this is the hub provider for `cooked-meal`, `cooking-now`, `meal-planned`, `shopping-list`, `pantry-inventory`, `pantry-low`); container local DB (move off localStorage onto schemas — Ledger already shows the pattern); `data-shippie-wakelock` (already in `enhance.rules`); `feel.texture('milestone')` for the cooked-meal moment.

**Effort.** L (Today refactor + pantry-barcode = M; OCR recipe ingest = S–M; desktop three-column = M). Split into 3 PRs.

---

## 2 · Chiwit (`apps/showcase-chiwit/`)

**What it is.** Daily Pulse — sleep, mood, energy, hydration, movement, mindful, body signals. 5 tabs (`today`/`track`/`patterns`/`timeline`/`data`). Provides 7 intents, consumes 5 (cooked-meal, caffeine-logged, coffee-brewed, brewed-tea, wellness-ritual). New app — currently untracked in git.

**Current state.** Single-file `App.tsx` (832 lines). LocalStorage only. Computes `PulseScore` (0–100) with breakdown across foundations/recovery/movement/mind/body. Insight cards with dismiss. 14-day mini-ribbon. External signals from other apps fold into entries as `addExternalSignal` with 10-min dedupe. Sophisticated quick-log + check-in flows.

**Standout play: "Reading" the day, not scoring it.** Chiwit already has the right voice ("life feels open today", "keep the bar kind and small"). Double down on a *literary* daily summary — the one screen people will screenshot. Not just a number.

**Feature improvements**
- **Daily reading card.** At 9pm, a one-paragraph reading of the day, two sentences max, written in second-person and grounded in the actual signals: "Hydration steady, sleep 7.5h, mood a touch low after the afternoon dip — gentle attention helps tomorrow." Generated locally (no LLM call) from templated fragments keyed to score bands.
- **Streaks done right.** Replace any streak counter with "consistency" — % of last 7 days with ≥3 signals logged. Streaks punish missed days; consistency forgives them.
- **Body-metrics absorption.** `body-metrics` has `successor: chiwit` in its shippie.json. Add a one-tap weight log to Track (the `weight` kind already exists in `KIND_META` but no UI surface). Then mark body-metrics retired.
- **Wellness ritual hookup.** Already subscribes to `wellness-ritual` but nothing publishes it yet. Spec the schema, add a "ritual completed" quick-log in `track`, broadcast it. Future-proofs the meditation/breath integrations.

**UX — mobile**
- Pulse ring is good. Anchor it top-of-screen with the reading paragraph beneath it. The current `hero-plane` is two-column on a phone — collapse to one.
- Quick-log grid → swipe-deck. Quick-log of 7 actions in a grid pushes content below the fold. A horizontal swipeable deck of "what do you notice?" cards keeps Today single-screen.
- "Why are you logging?" → soft mood-prompt at evening check-in only, not every entry.

**UX — desktop**
- Two-column: Pulse + reading on the left, timeline ribbon + insights on the right. Patterns becomes a full-screen calendar heatmap (one cell per day) — desktop-only view; mobile stays at the 14-day ribbon.
- Keyboard: number keys 1-7 quick-log the corresponding entry.

**UI**
- The salmon (`#F97066`) is too warm — bordering on energy-drink. Shift toward a softer coral-cream pair: keep the warmth but mute the saturation. The wellness category benchmark (Calm, Headspace) leans cool-neutral.
- Replace the per-kind colour dots with a single warm gradient indicator — the entry kind shouldn't fight the pulse colour for attention.
- Logo placement — the `<img>` inside the pulse ring is a charming move; keep it but ensure it scales cleanly to retina (the brand asset path is `/brand/chiwit-logo.png` — needs a 2x).

**Infra leverage.** Iframe SDK intents (already wired across 12 channels); `feel.texture('confirm'/'milestone')`; the daily reading is templated locally — no AI dependency, no server. Future: subscribe to `coffee-brewed` from Coffee, `dined-out` from Restaurant Memory, `cooked-meal` from Palate to enrich the reading.

**Effort.** M. Reading card + consistency + body-metrics absorb = M; UI palette shift = S; desktop heatmap = M.

---

## 3 · Atlas (`apps/showcase-atlas/`)

**What it is.** Offline trip companion — pin places, drop notes, photos, sync between phones in a trip. 4 routes (`trips`/`trip`/`pin`/`companions`). Container local DB. Real two-phone gossip relay sync via room code + passphrase.

**Current state.** Marked `archived` in shippie.json but the code is sophisticated (relay-provider, sync-bar, trip binding, companions page). Provides `trip-note`, `place-pinned`; consumes `dined-out`. Has `atlas-app-eyebrow` identity already.

**Standout play: "The map that works on the plane."** Offline-first travel companion is the brief. Make the offline story *visible* — show a "✓ offline-ready" mode toggle on the Trips list. Nobody else does this.

**Feature improvements**
- **Offline map tiles.** Currently you can pin places but the map (if any) hits the network. Pre-cache MapLibre tiles for the trip's bounding box into R2-backed Cache API before departure. "Download this trip's map" button. Critical for the airplane/no-data-roaming use case.
- **Dined-out hydration.** Already consumes `dined-out` from Restaurant Memory — surface those automatically as pinned places under a "Visited" overlay. One subscribe → free trip diary.
- **Trip share card.** Re-use the share-fragment pattern from Restaurant Memory (`readImportFragment`). A signed `#shippie-import=…` URL that brings the trip skeleton + first 5 photos into another phone's Atlas. No server.
- **Un-archive.** This app has real differentiation. Move it from `surface: archived` back to `featured` in shippie.json once the offline-map work lands.

**UX — mobile**
- Trips list → swipe-down "What's near me?" peek that lists pinned places by distance using device geo (already permissioned via Restaurant Memory's pattern). One-tap to open in maps.
- Pin-drop flow: drop pin first, then optional photo + note. Right now it might be photo-first which slows pinning when you're walking.

**UX — desktop**
- Two-pane: trip list left, map right. Drag a "Visited" entry onto a date to organise the trip itinerary.

**UI**
- Atlas already has its own design language (atlas-app-eyebrow, atlas-empty, atlas-main). Keep it; add a paper-map texture to the trip-list cards. Atlas should feel like a real travel notebook, not a tile grid. Use the Fraunces serif for place names.
- Sync state is shown via `SyncBar`. Make this more prominent — a 12px green pill "synced 3 min ago" is part of the trust story.

**Infra leverage.** Container local DB (already on it); gossip relay (already on it); intent consume (`dined-out` from Restaurant Memory); share fragment + signed import (steal pattern from Restaurant Memory). Map tile cache → service-worker `cache.addAll` + R2 origin if you choose to mirror tiles, or pull from MapTiler directly with a `Cache-Control: public, max-age=…`.

**Effort.** M (offline tiles is the hardest part; dined-out overlay is S; share card is S).

---

## 4 · Coffee (`apps/showcase-coffee/`)

**What it is.** Ratio dial + bean library + brew timer + history. 3 tabs (Brew/Beans/History) plus a bean detail page. Broadcasts `coffee-brewed` and `caffeine-logged` (with calculated mg via `MG_PER_GRAM[method]`).

**Current state.** Solid IA. localStorage. Each brew can be rated post-pull. Tasting notes per bean.

**Standout play: "The same V60, every time."** Coffee enthusiasts obsess over reproducibility. Make Coffee the app that says "you've pulled this 14 times; here's the bean+water+time+grind combo that scored you 4★ twice in a row." Pattern-finding for brews.

**Feature improvements**
- **"Brew the usual" — actually one tap.** App tagline says so; the UI doesn't. On Brew tab, if there's a top-rated brew for the last-used bean, show one big card: "[Bean] · 18g→290g · 2:45 · V60 · Med-fine — Brew this." Tap = start timer with values pre-loaded.
- **Bean depletion.** Add `grams_remaining` to bean schema; subtract on each brew. Show "100g left ≈ 5 brews" on bean tiles. Triggers `needs-restocking` intent at <30g — Palate's shop tab can listen.
- **Cupping comparison sheet.** When you have ≥2 ratings for one bean, show a tiny radar/spider of (acidity/body/sweetness/bitter/finish) overlaid for last 3 brews of that bean. Reveals what's drifting.
- **Subscribe to mood.** Already provides caffeine; should subscribe to `mood-logged` (from Chiwit) and surface "you rated this brew 5★ on days you also logged mood ≥4 — pattern noted." Wellness loop.

**UX — mobile**
- Brew tab should be *the* tab. Beans + History are reference; Brew is the action. Default to Brew; the bottom-tab should highlight Brew with a slightly bigger touch target ("the verb").
- Timer screen: keep it dead-simple. One number, one ring, one pause/done. Don't add overlays mid-pull.

**UX — desktop**
- Two columns: Brew left (the action), Beans right (reference). History becomes a scrollable footer panel.
- Number-key shortcuts: 1=start, 2=lap, 3=done. Coffee snobs love keyboards.

**UI**
- The deep brown (`#8B5A3C`) + dark bg (`#14120F`) is good — espresso-bar aesthetic. Lean into it: large Fraunces serif numbers for grams/seconds, mono labels. The dial-style ratio control could be the visual signature — make it lush (subtle bevel, satisfying haptic via `feel.texture('confirm')` on each notch).
- Bean tiles: photo of bag + roaster mark + 1-sentence tasting note in italic Fraunces.

**Infra leverage.** Intent provide (`coffee-brewed`, `caffeine-logged`); subscribe to `mood-logged`; trigger `needs-restocking` at depletion threshold; `feel.texture` per timer tick.

**Effort.** S–M. "Brew the usual" + bean depletion = S. Cupping comparison + mood-subscribe = M.

---

## 5 · Restaurant Memory (`apps/showcase-restaurant-memory/`)

**What it is.** Photo + note per restaurant. Camera + geo. Privacy ribbon explicit ("photos and coordinates stay on this device. dined-out broadcast carries name + rating only"). Featured · food-drink.

**Current state.** Single-page form-driven log. ShareSheet + signed import-fragment flow (other phones can ingest a shared visit). Subscribes to `cooked-meal` → home-vs-out ratio.

**Standout play: "The food memory you can search by photo."** Long-press a photo from a year ago: "this is from Hoppers, 8 months ago, you gave it 4★". Use on-device labels + recall by image content.

**Feature improvements**
- **On-device food labelling.** Run a small image classifier via Transformers.js (e.g. `Xenova/clip-vit-base-patch32`) at log-time. Store labels with the visit (already used in snap-and-forget). Searchable: "ramen", "sushi", "anything with chips." Photos never leave device.
- **Map view.** Geo is captured but only shown as text. Add a "Map" tab with pinned visits. Atlas could be the underlying engine (shared dependency) or RM keeps its own minimal map.
- **Visit deduplication.** When you arrive at a place you've been, surface "you were here in March — 4★, ordered the dumplings" before you write a new entry. Big delight moment.
- **"Eat again" surface.** Filter to top-rated visits; surface 3 nearby (geo-distance) as a "go back to" suggestion when phone time-of-day is "evening, weekend."

**UX — mobile**
- Single full-bleed log form is great; keep it. Add a tiny "+ photo of menu" capture alongside the dish photo — menu OCR is a future enhancement.
- Photo viewer needs a swipeable lightbox; currently each visit shows a thumbnail. Tap → full-screen with pinch zoom (use `Sheet` primitive from `apps/platform/src/lib/components/ui/Sheet.svelte` pattern).

**UX — desktop**
- Three-column: form left, list middle, photo grid right. The current single-flow page wastes desktop real estate.

**UI**
- The terracotta `#A86060` is good. Identity could lean into a restaurant-postcard aesthetic — vintage menu typography for restaurant names (Fraunces italic), printed-date stamp for visited_at. Make each visit feel like a saved postcard.
- The privacy ribbon at the top is correct for trust but visually heavy. Compress it to a single 16px icon + tooltip after first visit logged.

**Infra leverage.** Intent provide (`dined-out`, `place.snapped` via observation client); intent consume (`cooked-meal`); IndexedDB photo store (already on it); share fragment (already on it); on-device image labelling via Transformers.js (`/__esm/` proxy — established pattern).

**Effort.** M. Image labelling + dedup = M. Map tab = S if leaning on Atlas. UI postcard pass = S.

---

## 6 · Ledger (`apps/showcase-ledger/`)

**What it is.** Private expense tracking — no bank scraping, no aggregators. 6 tabs (Entries/Month/Recurring/Categories/Export/Settings) with `more` collapse pattern. Container local DB. Subscribes to `dined-out` + `shopping-list` → surfaces "log this as an expense?" prompt.

**Current state.** Marked `archived`. Surprisingly mature: recurring entries, categories, currency, CSV export. The consume-prompt is the cross-app moment — but the accept handler currently just shows a toast ("Tap + Log spending to record…") and doesn't pre-fill the form. The TODO is in the code at line 220-227.

**Standout play: "The expense log that fills itself in."** Make the dined-out → expense draft work for real. One tap accept = entry drafted. Right now it's "tap then re-tap." This is the most concrete cross-app win Shippie has and Ledger half-shipped it.

**Feature improvements**
- **Finish the consume-prompt loop.** When user accepts the prompt, push the values into a sessionStorage stash that EntryList reads on mount of its editor (the code comment says exactly this). 30-line change. Ship it.
- **Budget UI.** The "limit:" prefix-in-note hack is in the code — it works but is invisible to users. Add a proper budget per category in Settings → broadcast `budget-limit` automatically. The hack becomes a fallback.
- **Receipt-snap bridge.** Receipt Snap (the OCR app, just widened) provides `expense-logged`. Ledger should *consume* `expense-logged` (and dedupe). Right now Receipt Snap has the data, Ledger has the surface — they're not talking.
- **Un-archive.** Once consume-prompt + receipt-snap bridge ship, this is featured-grade. Surface = `featured`, category = `finance`.

**UX — mobile**
- 4 primary tabs + More is correct. Keep it.
- Entry creation should be one screen — amount + category + date + note + (optional) photo (via Receipt Snap intent). The flow should feel like writing a cheque, not filling a form.
- "Spent this month" should be a hero number on Month tab in tabular-mono (`.score-numeric.size-hero` already exists from the design pass).

**UX — desktop**
- Two-column: Entries list left, detail/editor right. Month view as a full-screen calendar with daily totals. Recurring as a side panel.
- Keyboard: `n` new entry, `/` search, arrow-keys to scrub months.

**UI**
- Forest (`#17694D`) + dark bg (`#151A17`) is right for "money is serious." Lean fully into a banking-statement aesthetic — tabular-mono everywhere, generous whitespace, no decoration on category chips beyond a 4px coloured edge.
- Add a tiny "✓ private" lockup near the top like Restaurant Memory's privacy ribbon — Ledger's no-bank-scraping promise is its differentiator and isn't currently visible.

**Infra leverage.** Container local DB (already); intent consume (`dined-out`, `shopping-list`, add `expense-logged` from Receipt Snap); intent provide (`expense-logged`, `budget-limit`); `feel.texture('confirm')` on save. CSV export → can pivot to a Cloudflare Workers signed-URL download if file gets large, but localStorage CSV is fine for now.

**Effort.** S. Consume-prompt fix is a half-day. Budget UI is S. Receipt-snap bridge is S. Total = 1–2 days.

---

## 7 · Body Metrics (`apps/showcase-body-metrics/`)

**What it is.** Weight + body photos, on-device only. 5 tabs (Today/Photos/Trend/Goal/Settings). Privacy-first (no upload path exists). Broadcasts `body-metrics-logged`.

**Current state.** Marked `archived` with `successor: chiwit`. The privacy story is its strongest pitch.

**Standout play (revised): graceful retirement → Chiwit absorption.** This isn't an app to evolve. It's an app to migrate users *from*. Make the migration a polished one-tap export → Chiwit-import, then ship the redirect (`/run/body-metrics` → `/run/chiwit?tab=track`).

**Feature improvements**
- **Add a one-tap "Move my data to Chiwit" button** in Settings. Reads entries from localStorage → pushes them into Chiwit's `STORAGE_KEY` (chiwit's `weight` EntryKind already exists). After migration, show "your data is now in Chiwit."
- **Time-lapse export.** The `TimeLapse.tsx` component exists. Before retirement, make sure users can export the video / sequence locally. After retirement, this becomes a Chiwit Pro feature (or dropped).
- **Read-only mode after a date.** Set a retirement date in shippie.json (e.g. 2026-08-01). After that date, the app loads in read-only mode with a banner: "Body Metrics has moved to Chiwit. Tap to migrate."

**UX**
- Skip UX rework. Sunset.

**UI**
- Skip UI rework. Sunset.

**Infra leverage.** The launch-redirects test that's currently failing (`/you` route warning) — same pattern applies here. Add an entry to the launch-redirects map for body-metrics → chiwit.

**Effort.** S. One-tap migration + read-only mode after date + redirect entry. Half-day.

---

## 8 · Match Room (`apps/showcase-match-room/`)

**What it is.** Private real-time match rooms — score predictions, votes, reactions, banter, sweepstake, trivia, wallchart, fantasy panel. Host / Guest / Display roles. Featured · social. Provides `matchday-prediction-stats`, `matchday-room-feed`, `live-match-status`.

**Current state.** Massive app. `host/`, `guest/`, `display/`, `fantasy/`, `shared/` (gossip relay, vote queue, peer-id, room-document, live-scores-client). i18n, time-zone aware. Themable. Room templates (`friends`/`hardcore`). Saved room shortcuts. Share cards. The `display` role is for casting to a TV — interesting third-screen play.

**Standout play: "The group chat that knows about the match."** Match Room sits in a competitive space (WhatsApp groups, Discord, official broadcaster apps). Its differentiator is *being designed for the 90 minutes*. Lean into that: every UI choice optimised for "I have a phone in one hand and a pint in the other."

**Feature improvements**
- **The Big Moment Card.** When `live-match-status` flips to "goal", surface a full-screen card for 8 seconds: who, minute, score now. One-tap reaction (🔥/😱/😡). Reactions stream to the room. This is the moment people pick up their phones — own it.
- **One-handed mode is the default.** Bottom-half-of-screen UI for all primary actions. Top half = scoreboard + reactions stream. Reduces thumb travel; matches how people actually hold phones at a match.
- **Pre-match → in-match → post-match phases as routes.** Right now everything is one matchday view. Three explicit phases:
  - **Pre:** predictions, sweepstake draw, who's coming.
  - **In:** big-moment cards, reaction stream, fantasy live score, banter.
  - **Post:** share card, predictions resolved, group leaderboard.
  Phase transitions auto-animate; users feel the flow.
- **Display role polish.** This is the secret weapon — casting Match Room to a TV. Reactions float across the screen in big bubbles. Make this look like a broadcast lower-third when displayed (Fraunces serif, big numbers, BBC-style typography). Already has its own component (`DisplayMatchday.tsx`).

**UX — mobile**
- Reaction picker: bottom-edge thumb arc (5 reactions at fingertip). Already partly there in `BanterPanel`; lean in.
- Voice notes via `MediaRecorder` for shoutouts. 5-second clip max; appears in the feed as a play button. Adds personality without latency.
- Haptic on every goal received via `feel.texture('milestone')`. Already used in Coffee + Chiwit.

**UX — desktop**
- Three-column: room feed left, match centre middle (live status, ballots), fantasy panel right.
- Keyboard: `space` send vote, `1-5` reactions, `r` start recording shoutout, `?` help.

**UI**
- Forest green (`#0E5C3A`) on cream is good but needs more contrast for live moments. When `live-match-status` is "GOAL", flash a high-contrast overlay (1s) — a moment, not a colour scheme change.
- Typography for scores: very large Fraunces serif. The eyebrow + score-numeric primitives are already wired (commit 5618c30a).
- The themable identity (`applyIdentityTheme(profile)` is in `app.tsx`) is a nice touch — let teams paint the room their colours. Make this discovery-easier (it's currently buried).

**Infra leverage.** Gossip relay (already); room-document persistence (already); intent provide (`matchday-prediction-stats` — currently has no consumer per the failing test; world-cup-fantasy consumes it but the wiring isn't complete); `feel.texture` everywhere.

**Effort.** L. Big-moment card + phases = M. Display polish = S. Voice notes = S. One-handed mode = M. Split into 3 PRs.

---

## 9 · World Cup Fantasy (`apps/showcase-world-cup-fantasy/`)

**What it is.** Private fantasy squad builder — captaincy, chips, budget, leaderboard with rival teams. Local-only ("while the format is tested"). Provides `fantasy-team.saved`; consumes `matchday-prediction-stats`.

**Current state.** Marked `archived`. Single-file `App.tsx`. Has a `fantasy-engine.ts` with rules + scoring + scout tips, plus a `LIVE_SNAPSHOTS` array and a snapshot navigator. Rival teams are hardcoded.

**Standout play: "Fantasy that hooks into the Match Room."** Standalone fantasy is generic. Fantasy that pulls live match stats from Match Room and resolves your captain's points in front of you during the game is the Shippie product. They already declare the link in shippie.json — but Match Room hasn't shipped the consumer side of `fantasy-team.saved` and the live-status flow.

**Feature improvements**
- **Wire the Match Room ↔ Fantasy bridge for real.** When Match Room broadcasts `live-match-status` (which the failing test says doesn't have a consumer yet), Fantasy should listen and update player scores live. The fantasy panel inside Match Room (`apps/showcase-match-room/src/fantasy/FantasyLeaguePanel.tsx`) is the same engine — collapse the duplication: Fantasy is the engine, Match Room embeds the panel.
- **"Make a draft picks card."** Use the same `#shippie-import=…` share fragment pattern from Restaurant Memory — share your fantasy squad to friends who can import + run their own. Drives Shippie's "no account, just share a link" story.
- **Friend leagues via Match Room rooms.** Don't build a separate friend-league concept. A Match Room IS your fantasy league — same room ID, same passphrase. One join code, two products.
- **Un-archive after the bridge ships.** Surface = `featured`, category = `social`.

**UX — mobile**
- Squad-builder needs a pitch-formation visual. Right now it's a player-list-by-position; users think in 4-3-3, 4-4-2 etc. A pitch graphic with players placed by position is the genre standard for a reason.
- "Live during the match" mode: collapse all but captain + bench, show running points with each goal/card.

**UX — desktop**
- Two-column: squad left, player-pool right with filters (position, budget remaining, form). Drag a player into a position slot.
- Keyboard: arrow keys to cycle positions, `c` set captain, `s` save.

**UI**
- The forest green + cream is the same as Match Room — good, they're a family. Add a pitch-green for the formation graphic and a marigold accent for captain (matches the Shippie palette).
- Big numeric for player price + points (already wired). Italic-mono for fixture difficulty ("MUN(A) — H").

**Infra leverage.** Intent provide (`fantasy-team.saved` — currently orphaned per intent-graph test); intent consume (`matchday-prediction-stats`, `live-match-status`); share fragment (steal from RM); shared engine with Match Room. localStorage is fine here — no need to escalate to container DB unless friend-league needs sync (in which case use Match Room's gossip relay).

**Effort.** M. Bridge wiring is small but coordinated with Match Room (needs both apps). Pitch graphic is M. Share card is S.

---

## Cross-cutting themes

After reading nine apps side by side:

1. **The intent graph has orphans.** `fantasy-team.saved`, `matchday-prediction-stats` and (per the failing tests) others are declared without consumers. Either consumers are added or these get moved into `ALLOWED_ORPHAN_PROVIDERS`. Today's design pass + this audit doc surface 6+ concrete wirings (Coffee→Chiwit, Ledger←Receipt-Snap, Atlas←RestaurantMemory, Palate↔RestaurantMemory, Fantasy↔MatchRoom, Chiwit←Coffee/Atlas/Restaurants).
2. **Three apps are mis-archived.** Atlas, Ledger, and World Cup Fantasy are marked `archived` but are arguably differentiated featured-grade apps. The audit suggests un-archiving each *after* one specific improvement ships (offline tiles / consume-prompt fix / fantasy bridge).
3. **Container DB migration is in flight.** Ledger and Atlas use it; Chiwit, Restaurant Memory, Coffee, Body Metrics, Match Room and World Cup Fantasy still use localStorage. Not urgent for any of them in isolation (data fits, no sync needed), but the schema-first apps gain export + cross-app reads.
4. **The Sheet primitive is underused.** It exists in `apps/platform/src/lib/components/ui/Sheet.svelte` (focus trap + scroll lock + role=dialog) but I don't see it in any of the showcase React apps. Several proposals lean on it (RM photo lightbox, Palate recipe sheet, Match Room big-moment card). Consider porting Sheet to a React equivalent in `@shippie/showcase-kit`.
5. **Desktop differentiation is consistent.** Every app's desktop story is "two or three columns + keyboard." If we ship a `@shippie/showcase-kit/desktop-shell` (multi-pane layout primitive with `cmd-k` shortcuts), every app inherits the desktop story for free.

---

## Suggested next moves

Picking three concrete next moves from this audit, ranked by impact-per-day:

1. **Ledger consume-prompt completion** (½ day) — the cross-app loop demo. Highest leverage: this is the story.
2. **Body Metrics → Chiwit migration tap** (½ day) — removes a featured-but-deprecated app cleanly. Also unblocks one failing test.
3. **Match Room ↔ Fantasy bridge wiring** (1 day) — unblocks two failing intent-graph tests; lets Fantasy un-archive.

Everything else slots into a fortnight of focused work, app by app.
