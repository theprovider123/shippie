# Best-in-Class Showcase Elevation — Chiwit, Palate, Match Room, World Cup Fantasy

**Date:** 2026-05-19  
**Status:** Approved for implementation  
**Scope:** Full product elevation of four flagship showcases — visual + hero feature + closing keepsake + cross-app intent visibility + onboarding + complete data lifecycle. NOT mevrouw (deliberately excluded).

---

## 1. Goal

Take four showcases from *typography-handshake-only* to *best-in-class local apps in their own respective atmospheres* — rivalling Airbnb-tier craft while showing off Shippie's platform superpowers (cross-app intents, proximity mesh, QR handoff, encrypted backup, PWA install) instead of cloud features.

**Out of scope:** on-device AI / Transformers.js — explicitly deferred. Memory + first-load cost not worth the headline. Existing Receipt Snap, Voice Memo, Pitch Forge keep their AI; the four target apps do not gain it.

---

## 2. Decisions locked

| Decision | Value |
|---|---|
| Depth | Full product elevation per app |
| Sequencing | Four parallel implementation streams |
| Architecture | Hybrid — shared functional plumbing in a new `@shippie/showcase-kit-v2` package; per-app visual skinning |
| AI superpower | OUT |
| Per-app hero (replacement) | Chiwit: ambient pulse · Palate: cook-with-me · Match Room: fanfare/presence/buzzer/keepsake · WC Fantasy: couch league |
| 6 shared platform moves | All IN: keepsake · onboarding · cross-app intent visibility · QR-first handoff · encrypted backup · empty-state atmosphere |

---

## 3. Architecture — `packages/showcase-kit-v2`

New workspace package, peer of `@shippie/sdk`, `@shippie/share`, `@shippie/qr`, `@shippie/proximity`. Follows the proven workspace export pattern (`exports.types` and `exports.import` both `./src/index.ts` — immune to `tsup --clean` races during parallel typecheck/build).

### 3.1 Package structure

```
packages/showcase-kit-v2/
├── package.json          name: @shippie/showcase-kit-v2
├── tsconfig.json
├── tsup.config.ts        dts: true (CLAUDE.md gotcha)
├── src/
│   ├── keepsake/
│   │   ├── KeepsakeRenderer.tsx
│   │   ├── pdf-from-canvas.ts
│   │   ├── share-keepsake.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── onboarding/
│   │   ├── OnboardingFlow.tsx
│   │   ├── useFirstRun.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── intent-toast/
│   │   ├── IntentToastHost.tsx
│   │   ├── useToastQueue.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── qr-sheet/
│   │   ├── QrShareSheet.tsx
│   │   ├── encode-fragment.ts
│   │   └── index.ts
│   ├── backup-card/
│   │   ├── BackupCard.tsx
│   │   ├── useBackupState.ts
│   │   └── index.ts
│   ├── empty-state/
│   │   ├── EmptyState.tsx
│   │   ├── types.ts
│   │   └── index.ts
│   └── index.ts
└── tests/                vitest, mirrors src layout
```

### 3.2 Dependencies

- `react` 19 (peer)
- `@shippie/sdk` (workspace) — intent stream subscription
- `@shippie/share` (workspace) — signed fragment encoding
- `@shippie/qr` (workspace) — QR generation
- `@shippie/local-db` + `@shippie/backup-providers` (workspace) — backup primitives (already used by Palate; `@shippie/durability` v2 may absorb these later per the May 9 Steep session, but not in scope here)
- `jspdf` ^2.5 — canvas → PDF wrapping; small (~50 KB gzipped)

### 3.3 Component APIs

**`<KeepsakeRenderer>`** — renders an off-screen 1080×1350 canvas from a JSX template, exports as PNG + PDF, hands user `navigator.share({ files })` with anchor-download fallback.

```tsx
type KeepsakeRendererProps<T> = {
  template: ComponentType<{ data: T; ctx: CanvasRenderingContext2D }>;
  data: T;
  filename: string;            // e.g. "chiwit-week-2026-05-19.pdf"
  onShare?: (success: boolean) => void;
  trigger: ReactNode;          // the button/CTA that opens the share sheet
};
```

**`<OnboardingFlow>`** — slide carousel with version-aware localStorage gate.

```tsx
type OnboardingFlowProps = {
  appSlug: string;             // 'chiwit', 'palate', etc.
  version: number;             // bump to re-run for existing users
  children: ReactNode;         // <Slide> elements (2-3 max)
  onComplete?: () => void;
};
```

**`<IntentToastHost>`** — mounts at app root; subscribes to SDK intent stream; renders a single toast at a time.

```tsx
type IntentToastHostProps = {
  matchers: IntentMatcher[];
  position?: 'top' | 'bottom';   // default top on mobile, bottom on desktop
};
type IntentMatcher = {
  kind: string;                  // e.g. 'coffee.brewed'
  toast: (intent: Intent) => { title: string; body?: string; href?: string };
  throttleMs?: number;           // default 30_000 (max 3 in window)
};
```

**`<QrShareSheet>`** — bottom sheet with 320×320 QR + URL copy + Web Share button.

```tsx
type QrShareSheetProps = {
  open: boolean;
  payload: SignedFragmentPayload;
  url: string;
  title: string;                 // e.g. "Pass this squad to the next manager"
  onClose: () => void;
};
```

**`<BackupCard>`** — Data-page primitive. Wraps existing backup-providers.

```tsx
type BackupCardProps = {
  appSlug: string;
  dataStore: BackupableStore;    // from @shippie/durability
};
```

**`<EmptyState>`** — slot primitive.

```tsx
type EmptyStateProps = {
  eyebrow: string;
  headline: ReactNode;           // allows <em> italic accent
  body?: ReactNode;
  cta?: { label: string; onClick: () => void } | { label: string; href: string };
};
```

### 3.4 Why this works

- Mirrors the `@shippie/sdk` pattern proven across 3 production showcases.
- `dts: true` in `tsup.config.ts` per the May 18 session's caught gotcha (turbo `^build` cache didn't invalidate when `dts: true` wasn't set; led to `TS7016` cascade).
- `exports.types` + `exports.import` both → `./src/index.ts` per `local-db` / `ambient` / `backup-providers` / `intelligence` / `proximity` precedent.
- Keepsake PDF generation lifts the proven canvas-only pattern from `showcase-crewtrip`'s `utils/wrap-card.ts` (May 8 session). No new heavy dependencies beyond `jspdf`.

---

## 4. Per-app design — Chiwit

### 4.1 Hero superpower — Ambient pulse

`IntentToastHost` wires the SDK intent stream so other Shippie apps fill in Chiwit's day automatically. Ambient signals appear alongside manually-logged ones, distinguished by a tiny sibling-app icon.

**Intent matchers:**

| Kind | Effect |
|---|---|
| `coffee.brewed` | Hydration boost +1 signal |
| `workout.completed` | Movement factor +1 |
| `mindful.completed` | Mind factor +1 |
| `meal.cooked` | Foundations factor +1 |
| `sleep.logged` | Recovery factor +1 |
| `hydration.logged` | Direct hydration +1 (already partial) |

Ambient signals tagged with `source: 'app_<sibling>'` in the local DB so they're auditable and removable.

### 4.2 Onboarding (3 slides)

1. **"Five signals a day. No app account."** — what a signal is, the local-first promise.
2. **"Your other apps already know about your coffee, sleep, workouts. Chiwit reads them so you don't double-log."** — ambient pulse intro.
3. **"Tap a quick-signal pill, or open Log when you have a sentence."** — first CTA.

Version: 1. Bump to 2 when ambient pulse changes meaningfully.

### 4.3 Visual lifts

- Sage-on-cream branded button style (replace generic white-rgba). Primary: sage bg + cream text. Secondary: cream bg + sage ink + sage border.
- Insight cards: tone-driven hierarchy. `tone: 'good'` → sage left-rule; `tone: 'watch'` → coral left-rule; `tone: 'neutral'` → muted. Each card gets an icon and a one-line "why this matters" subline.
- Hero "reading" upgraded from whisper to pull-quote: Fraunces italic 1.4rem, sage left-rule, 0.85 line-height.
- Quick-action labels expanded ("Hydration · +250 ml") with on-tap color legend.
- Pulse-factor breakdown: inline helper text ("Foundations = sleep + hydration + meals").
- Timeline: month-jump scrubber at top of the view.

### 4.4 Empty states

| Surface | Copy |
|---|---|
| Today (no signals) | "Today's empty. Start with the thing you noticed in the last hour." |
| Patterns (insufficient) | "Five signals across three days will show your shape." |
| Insights (none) | "Signals from 2 days build the first pattern card." |
| Timeline (new install) | "Your first week opens here." |

### 4.5 Keepsake — Weekly-shape card

1080×1350 canvas template. Layout:
- Top: mono eyebrow "WEEK OF MAY 11 — MAY 17"
- Hero number: pulse score for the week (e.g. "68") at .pulse-numeric size-hero
- Italic Fraunces line: "23 signals · 6 days · steady rhythm"
- 5 factor bars (Foundations / Recovery / Movement / Mind / Body) with sage fills
- 7-day pulse ribbon (height-mapped bars)
- Footer: italic-mono `chiwit/wk-2026-20` code

Filename pattern: `chiwit-week-{YYYY-WW}.pdf`.

### 4.6 Cross-app intent visibility

IntentToastHost toasts appear top-right on mobile (above hero), top-bar on desktop. Toast taps deep-link to Today with `?source=intent-<kind>` so the user can audit the ambient signal.

### 4.7 QR handoff

Share weekly-shape as signed QR. Payload: anonymised week summary (factors, signal counts, no notes). Receiver can scan to see the 7-day shape of a friend.

### 4.8 Backup

`<BackupCard>` on the Data tab. Reframes the page from "wipe my device" to "your week is safe".

---

## 5. Per-app design — Palate (showcase-recipe)

### 5.1 Hero superpower — Cook with me

Two phones in the same kitchen sync step + ingredient list + timer via relay-gossip (same transport as Match Room).

**Flow:**
1. Phone A opens CookMode → emits `cooking-now` intent with `{ recipeId, step, servings, timerExpiresAt, sessionId }`
2. Phone B (any Palate install in same network) shows IntentToast: "Devante is cooking Sage Bean Stew — open with them?"
3. Tap → Phone B opens Cook-Along view with the same recipe + state
4. Either phone advances the step → next-step intent broadcasts → both views update
5. Timer state is the authoritative payload — last-writer-wins

Transport: relay-gossip via `@shippie/proximity`. Session expires 4h after first step.

### 5.2 Onboarding (3 slides)

1. **"A cookbook that remembers."** — Palate's voice + local-first.
2. **"Your dishes, your phone — no Pinterest, no Supabase."** — durability + privacy.
3. **"Cook together. Snap a recipe card later (opt-in)."** — proximity hero + OCR teased.

Version: 1.

### 5.3 Visual lifts — the form-scaffolding sections

- **Pantry table** — location badges (sage-tile icons: 🥶 fridge, 🥫 pantry, ❄ freezer, 🌿 spice-rack), inline low-stock tint (sage 8% background), expiry-countdown chip ("3 days left" mono).
- **Plan view** — calendar layout. Date header with weekday + date in Fraunces. 4-meal grid per day (breakfast/lunch/dinner/snack). Meal-type color coding (breakfast amber, lunch coral, dinner pitch-green, snack sage). "Today's plan: 2/4 set" summary at top.
- **Shop view** — source-attribution badges (planned/manual/pantry-gap) with distinct colors. Aisle/category grouping (produce, dairy, dry, frozen, household).
- **RecipeSheet modal** — photo hero (currently buried), dietary tags as sage-green pills, cuisine as programme-style badge, ingredients in sage-tile boxes (quantity bold, unit muted), method in numbered boxes.
- **Recipe editor sidebar** — photo preview hero, dietary tags as pills.
- **Data page** — replace KB metric with "last backup" timestamp + Back up now CTA via `<BackupCard>`.

### 5.4 Empty states

| Surface | Copy |
|---|---|
| Cookbook (none) | "Save the first dish worth repeating." |
| Plan (empty) | "Drag a recipe into Monday dinner." |
| Pantry (empty) | "Pop in the four staples that always run out." |
| Shop (empty) | "What does this week need?" |
| Cook history (none) | "Cook your first dish and it'll live here." |

### 5.5 Keepsake — Cook-recap card

Triggered after CookMode completes. 1080×1350 canvas:
- Recipe photo as hero (or generated tile if no photo)
- Fraunces title + cuisine badge
- Scaled-quantity ingredients (the actual quantities cooked, not the source recipe)
- Cook duration mono ("47 min")
- User's notes from this cook (input prompt at CookMode end)
- Italic-mono footer: `palate/<slug>/v{cookCount}`

Filename: `palate-{slug}-cook-{YYYYMMDD-HHMMSS}.pdf` (timestamp suffix so multiple cooks of the same dish on the same day don't collide).

### 5.6 Cross-app intent visibility

`pantry-low` from Pantry Scanner → badge "garlic low (via Pantry Scanner)" on Pantry tab. `cooked-meal` from another Palate (household) → "Mum cooked tonight's planned meal" toast.

### 5.7 QR handoff

Existing recipe share already partial; promote to `<QrShareSheet>` for consistency. Signed-fragment payload includes recipe + ingredients + steps + dietary tags (no photo to keep QR scannable).

### 5.8 Backup

Already shipped. Wrap in `<BackupCard>` for visual + UX consistency with other apps.

---

## 6. Per-app design — Match Room

### 6.1 Hero superpower — Real-time fanfare + presence + buzzer-fairness + keepsake

Match Room already has relay-gossip multipeer; now wire the moments around it.

- **Hero scoreboard** — full-bleed pre-match card. Team-color stripes (gold-leaf on pitch-green), 96px Fraunces fixture title, kickoff countdown in mono ("KICK-OFF IN 1:23:45"), "[N] in the room · L M D" presence pill. Replaces the bordered-card hero.
- **Presence ribbon** — persistent strip below header showing 2-letter peer initials + team-color dot + "voted last" mark.
- **Poll-close fanfare** — confetti canvas burst (200ms, max 60 particles, reduced-motion fallback), tone-color flash on scoreboard, single haptic tick.
- **Buzzer fairness** — goal-prediction polls close when a strict majority of currently-present peers have voted (`floor(N/2) + 1` of `N` connected peers, with `N >= 2`), not host clock. "PEER-LOCKED" italic-mono badge on closed polls.
- **MVP votes** — post-match POTM vote across peers. Result printed in keepsake.
- **Sweepstake tracker** — promote stub `SweepstakePanel` to real lifecycle: host opens at kickoff with prediction prompts; peers enter; host reveals at full-time.

### 6.2 Onboarding (3 slides)

1. **"Your private matchday room. No account."** — local-first + role intro.
2. **"Start solo, or send a QR to your mates."** — couch flow + QR-first.
3. **"When the final whistle blows, you get a programme keepsake."** — closing artifact tease.

Version: 1.

### 6.3 Visual lifts

- Saved rooms become cards (not bullets): match-code badge + kickoff mono + peer-count + "your role" pill.
- **QR-first join** — host shows large QR on screen mode; guest scans → instant join. URL paste falls to fallback.
- Empty pre-match: team lineups, fixture info, kickoff countdown, "Tap to draw your sweepstake number" CTA.
- Shoutout queue: live-stream view for the host with swipe-right-to-approve gesture (instead of batched review).
- Italic-mono match codes maintained throughout, never plain text.

### 6.4 Empty states

| Surface | Copy |
|---|---|
| No room created | "Tap a fixture. Your room opens in a second." |
| Solo room | "It's you alone — share the QR if you want company." |
| No polls yet (host) | "Open a poll when the moment lands." |
| No polls yet (guest) | "Waiting for the host to open the first vote." |
| Shoutout queue (host) | "When the room shouts, you'll moderate here." |

### 6.5 Keepsake — Full-time programme PDF

1080×1350 canvas:
- Fixture title (Fraunces 96px) + final score in big mono numerals
- Predictions leaderboard (top 5 peers by accuracy)
- MVP vote winner with peer signatures
- Best 3 shoutouts (host's pinned + most-cheered)
- Photo mosaic from peers (3×2 grid if photos contributed; otherwise pitch-grid texture)
- Italic-mono `match-room/<fixture-code>` footer
- Peer signatures row (initials + team-color dots)

Filename: `match-room-{fixture-code}-fulltime.pdf`.

### 6.6 Cross-app intent visibility

WC Fantasy emits `fantasy-team.saved` from a friend → "Sarah's locked in! 🔒" cheer toast.

### 6.7 QR handoff

Primary join path is QR. Host's screen-mode shows large 480×480 QR. Guest scans → opens room directly.

### 6.8 Backup

Room archive encrypted backup ("Save this match forever"). Per-room backup so individual matches can be restored separately.

---

## 7. Per-app design — World Cup Fantasy

### 7.1 Hero superpower — Couch league

Build a private 4–8-manager league in 90 seconds by passing one phone around.

**Flow:**
1. Phone A creates league → picks squad → taps **Pass to next manager** → `<QrShareSheet>` shows signed-fragment league-context QR.
2. Phone B scans → opens fresh squad picker pre-loaded with the league's tournament data (same fixtures, same player prices, league ID).
3. Phone B picks squad → taps **Pass** → next QR.
4. Cycle until last manager taps **Lock league**.
5. Each phone keeps its own squad locally. League standings computed peer-to-peer from broadcast `fantasy-team.scoreSnapshot` intents.

No server. League ID is a UUID generated at create-time; signed by Phone A's local key.

### 7.2 Onboarding (3 slides)

1. **"A squad sheet for 8 friends."** — voice + format.
2. **"Pass the phone around to build the league. No server."** — couch flow.
3. **"After the final, everyone gets the programme."** — keepsake tease.

Version: 1.

### 7.3 Visual lifts

- **Player rows → player cards** — badge color stripe, position chip, price mono, projected delta. Touch target stays large for thumb tap.
- **Scout tips with visual anchor** — icon + callout box + "why this matters" subline. Stop reading as a bulleted list.
- **Leaderboard drama** — position-change glow on snapshot transitions (sage for up, coral for down), +N/-N badge, captain contribution highlighted with a gold dot.
- **Captain compare** — tap two players to see side-by-side "if captain" scoring.
- **Draft state** — partial squad saved at every step; cold-open shows "Resume your draft (7 of 15)".
- **Budget margin** — running spend horizontal bar with marks for £125m cap, current spend, projected for remaining slots. Warns at <£3m left.
- **Chips clarity** — each chip card shows when "hot": triple-captain glows when top scorer is captained on a fixture day; bench-boost glows when bench projected >15pts.

### 7.4 Empty states

| Surface | Copy |
|---|---|
| No squad | "15 players, £125m, three transfers banked. Start picking." |
| Draft | "Saved your 7 picks. Tap to keep going." |
| Pre-tournament | Lineup news + kickoff countdown + "Who do your friends pick?" tease. |
| No league | "Start a couch league — pass the phone around." |
| Empty leaderboard | "Locked in, waiting for kickoff." |

### 7.5 Keepsake — Tournament programme PDF

Triggered after final-snapshot transition. 1080×1350 canvas:
- Fraunces title "{Tournament name} 2026" + gold-leaf accent
- Final squad with captain crown
- Captain log per match (table of fixture + captain + score)
- League finish (your position + 1st place + delta)
- Snapshot deltas (your point trajectory across 4 snapshots)
- Italic-mono footer: `wcfantasy/{league-id}/final`
- Peer signature row (all managers' initials)

Filename: `wcfantasy-{league-id}-final.pdf`.

### 7.6 Cross-app intent visibility

Match Room broadcasts `match.kickoff-soon` → "Kickoff in 10 minutes — your captain plays" banner.

### 7.7 QR handoff

Couch-league pass-the-phone is the primary use case. QR encodes the signed league-context. Secondary: share-squad-as-image (existing).

### 7.8 Backup

Encrypted league + squad backup. Restoring restores both squad and league standings (peers re-broadcast their scores when they detect a restored device).

---

## 8. Testing strategy

### 8.1 Unit tests (vitest, in `packages/showcase-kit-v2/tests/`)

- `keepsake/pdf-from-canvas.test.ts` — given a known JSX template + data, PDF byte-hash is stable
- `intent-toast/useToastQueue.test.ts` — debouncing (max 1 visible), throttling (max 3 / 30s), auto-dismiss
- `onboarding/useFirstRun.test.ts` — version-aware localStorage gate, idempotency
- `qr-sheet/encode-fragment.test.ts` — signed payload roundtrip
- `empty-state/EmptyState.test.tsx` — slot rendering, italic accent on headline `<em>`
- `backup-card/useBackupState.test.ts` — state transitions (never → backed-up → restoring)

### 8.2 Per-app integration tests (vitest)

Each app gets a test file:
- `apps/showcase-{chiwit,recipe,match-room,world-cup-fantasy}/tests/elevation.test.tsx`

Each covers:
- Onboarding gate writes localStorage correctly
- Keepsake renders with correct MIME and filename
- IntentToastHost subscribes + toasts on emit
- Empty-state primitive renders app-specific copy
- BackupCard roundtrip (save → restore → deep-equal)

### 8.3 E2E (Playwright, in `apps/platform/tests/showcases-elevation.spec.ts`)

Four short specs (one per app), each ~60s:
1. Open app cold → onboarding fires → skip works → second open skips
2. First action → empty state copy correct
3. Complete a session → keepsake render → share-sheet opens
4. Open app B → emit intent from app A → toast appears

### 8.4 Cross-app smoke

Manual local smoke per Phase 2 of rollout: open all 4 apps locally; emit intents from each; verify others see toasts.

### 8.5 Health gate

`bun run health` (typecheck + test + build) must be green at every phase transition. Pre-commit hook denies on type errors.

---

## 9. Rollout — 5 phases

### Phase 0 — `showcase-kit-v2` package

Scaffolding + 6 components + unit tests. One app smoke-imports to verify package wiring. Single commit.

**Deliverables:** package compiles, `dts: true` regenerates types, all unit tests pass, `@shippie/showcase-kit-v2` published in workspace.

### Phase 1 — Four parallel app elevations

`superpowers:subagent-driven-development` — 4 implementer agents in parallel, each owning one app's full elevation (sections 4 / 5 / 6 / 7 of this spec).

**Per-agent deliverables:**
- Onboarding flow integrated + tested
- Hero superpower wired
- All visual lifts applied
- All empty states populated
- IntentToastHost mounted with matchers
- QrShareSheet integrated
- BackupCard mounted on Data page
- Keepsake template + render + share-sheet integration
- App's elevation integration test passes
- `bun run --cwd apps/showcase-{slug} check` green
- `bun run --cwd apps/showcase-{slug} build` green

Per-app commits; no cross-app merge conflicts (different `apps/showcase-*` directories).

### Phase 2 — Cross-app intent smoke

Manual local run: open all 4 apps in dev, emit intents from each, verify IntentToastHost surfaces them in the others. Adjust matchers if needed.

### Phase 3 — Real-phone smoke (user-driven)

Per `docs/launch/real-phone-checklist.md` extended for the 4 elevations:
- Onboarding skips on return (iPhone Safari + Android Chrome)
- Keepsake share-sheet opens in iOS Files / Android Share
- Buzzer-fairness reaches consensus across 2 real phones on same wifi
- Couch-league QR roundtrip works between 2 phones
- Cook-with-me proximity sync survives phone-locked → unlocked transition

### Phase 4 — Deploy (user-authorized)

`rm -rf .svelte-kit .wrangler dist && bun run deploy` from `apps/platform/`. Run 13-route prod smoke. Update `docs/CURRENT_STATE.md`. Tag release.

---

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Turbo cache stale on new package (May 18 incident) | `dts: true` in `tsup.config.ts`; `rm -rf packages/*/dist` if `TS7016` cascades |
| iOS Safari memory pressure on keepsake canvas (1080×1350 PNG) | Render-and-release pattern; canvas detached after PNG extraction |
| Intent toast spam from chatty siblings | Throttle (3 / 30s) + debounce (max 1 visible) baked into `useToastQueue` |
| Couch-league QR fails offline | Signed fragments verified locally; no network required to receive |
| `bun \| tail` exit-code masking (5th-time recurring) | `set -o pipefail` discipline at every phase health check |
| Stale `.svelte-kit` / `.wrangler` deploy (5th-time recurring) | `rm -rf` baked into Phase 4 (eventually into `deploy` script) |

---

## 11. Non-goals (deliberately deferred)

- On-device AI in any of the 4 target apps
- Real fixture data wiring (Match Room + WC Fantasy stay on seeded tournament data; user CSV/URL import is post-launch)
- Mevrouw (explicitly excluded per user)
- Cross-app intent **schema standardisation** — the matchers in sections 4.1 / 5.6 / 6.6 / 7.6 reference intent kinds like `coffee.brewed`, `workout.completed`, `fantasy-team.saved`. Implementer agents must discover the actual emitted kinds from the source apps (`apps/showcase-coffee/`, `apps/showcase-lift/`, etc. + `packages/sdk`) at Phase 1 start. Where a referenced kind doesn't yet exist, the matcher targets the closest emitted kind; intent-schema reconciliation is a follow-up.
- Native graduation
- Federation / multi-Hub mesh

---

## 12. Success criteria

- Each of the four apps scores **9/10 or better** on the design pattern doc's 10-point check (`docs/launch/2026-05-19-showcase-design-pattern.md`).
- Each app produces a downloadable keepsake artifact.
- Cross-app intent toasts visible in all 4 apps when siblings emit.
- Onboarding flow completes + skips on return on iPhone Safari, Android Chrome, desktop Chrome.
- `bun run health` green across all phases.
- 13/13 prod smoke routes return 200 after Phase 4.
- Real-phone checklist passes per Phase 3.
