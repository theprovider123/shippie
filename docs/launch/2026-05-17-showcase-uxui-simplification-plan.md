# 2026-05-17 — Showcase UX/UI simplification plan

Third companion to the 2026-05-17 set:

- [`2026-05-17-showcase-mobile-pwa-review.md`](./2026-05-17-showcase-mobile-pwa-review.md) (Codex's launch-shape review)
- [`2026-05-17-launch-slate-consolidation.md`](./2026-05-17-launch-slate-consolidation.md) (4-phase fold/absorb plan)
- [`2026-05-17-showcase-design-system-plan.md`](./2026-05-17-showcase-design-system-plan.md) (token + shared-UI infrastructure)

This plan is **look-and-feel + UX/UI simplification only**. No new
features, no data layer, no architecture. Per-app surface reduction.
27 priority apps audited at HEAD post user's recent changes.

## Audit summary

| Bucket | Count | Effort per app |
|---|---:|---|
| Already polished — leave alone | 8 | 0 |
| Easy wins — one clear simplification | 14 | 1 day each, but grouped by pattern they collapse to ~5 days total |
| Significant rework — front-page IA is wrong | 5 | 2–3 days each |

**Already polished (no work):** Voice Memo, Breath, Therapy Notes, Tab,
Care Log, Co-Pilot, Site Visit, Cooking.

## Locked principle (carries from prior plans)

**Curate polish over uniformity.** Each app keeps its visual identity.
We're removing competing surfaces, not redesigning brand.

**North star.** Every app opens to one obvious thing to do, with
everything else gracefully tucked one layer deeper.

---

## UX Simplification Scorecard (per-app acceptance gate)

Every touched app must pass this 9-item scorecard before its phase
ships. Each criterion is a yes/no:

1. First screen has one visually dominant primary action
2. No more than one banner/alert visible at a time
3. No more than 4 visible nav destinations on iPhone SE width
4. Settings reachable in ≤2 taps from any screen
5. Secondary tools hidden but discoverable (overflow / sheet / "More")
6. No overlapping or cramped UI on iPhone SE (375×667 portrait)
7. Returning users see less explanation than fresh users (versioned)
8. Empty states still explain what to do (no blank-screen punishment)
9. PWA states tested: safe-area-inset on notch devices, keyboard up
   on inputs, reduced-motion respected, screen-reader labels on
   icon-only controls

Apps in the "already polished" bucket should also be sanity-checked
against this once — silent regressions are easy to miss.

---

## Visual QA gate (cross-cutting)

Tests alone don't validate a UI simplification. **Every touched app
gets before/after screenshots at three viewports** before merge:

| Viewport | Why |
|---|---|
| iPhone SE 375×667 | Smallest realistic phone — most cramped |
| iPhone 14/15 Pro 393×852 | Modern phone with safe-area-inset |
| Desktop 1280×800 | Catches regressions where mobile-first work breaks wider layouts |

Acceptance is visual: fewer competing surfaces, clearer primary
action, no cramped nav. Captures live in
`docs/launch/screenshots/<YYYY-MM-DD>/<phase>-<app>-{before,after}-{se,pro,desktop}.png`.

If the captures look the same before and after — the phase didn't
actually simplify anything. Re-do.

---

## Phase 1 — Banner consolidation (1 day, low-risk)

**Pattern.** Three apps stack 2–3 dismissible top-banner alerts
(seed-note, install-nudge, backup-prompt, folded-app, consume-prompt,
toast). Each banner steals first-screen attention.

**Fix.** One alert slot per app, single most-relevant message at a
time, queued by priority.

| App | Today | After |
|---|---|---|
| Recipe | seed + install + folded notice stacked | Single alert slot, install nudge takes priority post-onboarding |
| Steep | seed + install + backup-prompt stacked | Single alert slot |
| Ledger | consume-prompt card + toast | Unified alert slot |

**Files:** entry point + relevant alert components in each app.

**Risk note.** "Low-risk" not zero-risk. Sloppy priority logic can
silently hide a critical prompt (backup-prompt before data loss,
install nudge before user loses their PWA shortcut). Explicit
priority order required per app, with fallback rules when multiple
banners qualify.

**State matrix to test (each app):**

| State | Expected banner |
|---|---|
| Fresh visit, never installed | install nudge |
| Returning visit, installed, no backup yet | backup-prompt |
| Returning visit, installed, backup configured | none (or contextual) |
| Folded-source app (Recipe only) | folded notice — single time, dismissible |
| Seed-data state (first-launch dev/preview) | seed note |

**Ship criteria:**

1. First paint on iPhone SE shows ≤1 banner across all 5 states
2. Critical prompts (backup, install) still surface when they should
3. UX Simplification Scorecard passes for all 3 apps
4. Visual QA screenshots captured at 3 viewports per app

**Cross-cutting opportunity.** This pattern is a candidate for the
`@shippie/showcase-ui` package (design-system plan Phase 2) — `<AlertSlot priority="..." />`. Extract it once 3 apps prove the pattern.

---

## Phase 2 — Onboarding subtitle fade (0.5 day, low-risk)

**Pattern.** Four apps show an instructional subtitle ("snap · review ·
save", "Photograph anything. Search by what was in it.", a mood-hint
correlation card, a privacy footer) that's helpful on day 1 and
clutter forever after.

**Fix.** Store a **versioned, namespaced** flag in localStorage,
render subtitle only when unset; auto-dismiss after first interaction.

### Flag naming convention (locked)

`<app-slug>:onboarding:<surface>:v<N>`

Examples:
- `receiptSnap:onboarding:headerSubtitle:v1`
- `snapAndForget:onboarding:heroSubtitle:v1`
- `cycle:onboarding:moodHint:v1`
- `symptomDiary:onboarding:privacyFooter:v1`

When the subtitle copy or position changes meaningfully later, bump
`v1` → `v2` and the improved hint shows again. Avoids the trap of
permanently hiding now-stale or now-relevant guidance.

### State matrix

| State | Subtitle visible? |
|---|---|
| Fresh visit (flag absent) | yes |
| Returning visit (flag matches current version) | no |
| Returning visit (flag is older version) | yes |
| Returning visit on a different surface than where dismissed | yes |

| App | Subtitle to fade |
|---|---|
| Receipt Snap | "snap · review · save" header subtitle |
| Snap and Forget | "Photograph anything. Search by what was in it." |
| Cycle | Mood-hint correlation card (auto-dismiss after 4s OR softer style) |
| Symptom Diary | Privacy-note footer — hide off the Print tab |

**Files:** entry point of each.

**Risk note.** Permanent hiding without versioning is the trap. The
versioning rule above prevents it. Also: don't dismiss the Symptom
Diary privacy footer entirely — that's load-bearing trust copy on the
Print tab where it belongs. Hide off Today/History/etc only.

**Ship criteria:**

1. Subtitle visible on fresh-visit, gone on returning visit, returns
   on version bump
2. UX Simplification Scorecard passes for all 4 apps
3. Visual QA screenshots captured at 3 viewports per app, including
   both fresh and returning states

---

## Phase 3 — Navigation restructure (2.5 days)

### Bottom-nav rulebook (locked, applies to every app touched in this phase and beyond)

1. **Max 4 visible primary tabs** on iPhone SE width
2. **At most one tab dedicated to the active task** (the thing the app
   is for) — usually the first tab
3. **Settings is never a primary tab unless the app is settings-heavy**
   (i.e. settings IS the product, like a preferences manager). It
   lives under "More" or in a header dropdown otherwise
4. **"More" is for management / export / history / less-used tools** —
   not for stuff the user actually does daily. If a route belongs
   in More by the rules above but is used daily, the IA is wrong
5. **Tab labels are nouns, not verbs** for navigation, verbs for
   actions (e.g. "Recipes" not "Browse")
6. **Tab icons + labels both**, never icons alone
7. **Active state is unmistakable** — not just a colour shift,
   reinforce with weight, underline, or backdrop

This rule applies to all apps in this phase **and** to any future app
adding bottom navigation. Document it in
`docs/design-system/conventions.md` (design-system plan Phase 1).

**Pattern.** Five apps either lack a coherent bottom nav, hide one
behind a Tools modal, or pack too many tabs.

| App | Today | After |
|---|---|---|
| Coffee | Header "Tools" button → bottom sheet with own tabs | Always-visible 3-tab bottom nav: Brew / Beans / History (no modal indirection). Note: consolidation plan Phase 1A handles the Brew primary action; this phase handles the nav structure beneath it. |
| Dough | Implicit routes, no visible nav, floating notify-prompt button | 4-tab bottom nav: Home / Active / History / Settings. Notify-prompt becomes a header toast. |
| Lift | Floating settings cog (non-standard) | Settings into the existing tab bar or a header dropdown |
| Ledger | 6 visible tabs (Entries / Month / Recurring / Cats / CSV / Settings) on phone-width | 4 primary tabs + "More" sheet for CSV + Settings. Rename "Cats" → "Categories" |
| Journal | 7 tabs (too wide for phone) | 4 primary tabs (Quick / Write / Browse / More) + "More" sheet for Search / Recall / Trends / Year |

**Files:** entry point + nav components in each.

**Ship criteria:** all five apps have bottom tab bars ≤4 visible
primary tabs on iPhone SE width. Settings always reachable in ≤2 taps.
No functionality dropped.

**Coordination.** Coffee's primary-action surface is owned by
consolidation Phase 1A. Sequence: ship consolidation 1A first, then
this phase polishes the nav beneath it.

---

## Phase 4 — Toolbar / modal collapse (1.5 days)

**Pattern.** Three apps surface secondary tools inline (color picker,
clear, replay, export, QR row, full-page modal forms) when they could
hide behind a single chip or sheet.

| App | Today | After |
|---|---|---|
| Whiteboard | Inline toolbar with color/clear/replay/export | Color picker stays inline (primary), clear/replay/export move into a single overflow menu |
| Drawing Telephone | QR + code row always visible during room | Single "Share" button that expands to QR + code on tap |
| Touch | LogTouchSheet (modal sheet) | Full-page route for log-touch input — easier text entry on phone, no half-modal awkwardness |

**Files:** room/sheet components in each.

**Ship criteria:** room/active-screen surface area on iPhone SE
increases by ≥20% (fewer chrome pixels). Sharing/export still reachable
in ≤1 tap.

---

## Phase 5 — Game first-screen polish (1 day, low-risk)

**Pattern.** Five Letter + Quartet both crowd the header (eyebrow +
mode/date row + mute + stats) and footer ("Group themes" reference
strip), competing with the puzzle.

| App | Top simplification |
|---|---|
| Five Letter | Hide mode switcher (Daily/Practice/Archive) after first tap, show small label only. Move stats panel to post-game overlay, not first-load. Hide "Group themes" footer until Help tap or solve. |
| Quartet | Move stats to post-game overlay. Hide archive mode switcher on first load. Trim header eyebrow visual weight. |

**Files:** entry point + stats/header components in each.

**Risk note.** Post-game overlay must not block accidental "play
again" taps on stats screen. Streak counters must remain accessible
from the puzzle screen in ≤1 tap — daily-game users often check streak
before deciding to play.

**Ship criteria:**

1. Puzzle is the visually dominant surface on first load
2. Mode/stats reachable in ≤1 tap from the puzzle screen
3. Post-game overlay dismissible without obscuring play-again CTA
4. UX Simplification Scorecard passes for both apps
5. Visual QA screenshots captured at 3 viewports, including in-progress
   and post-game states

---

## Phase 6 — Hero-panel deferral (2 days)

**Pattern.** Match Room + Crewtrip both have a strong Private Space
Hero that *should* dominate first load, but additional panels
(tournament stats, engagement loop, route cards, board switcher,
install panel, viral moments) compete with it.

### Match Room — nuance correction

"Hero only" is too aggressive — it risks hiding *why* Match Room is
fun, which is the route variety (friends/family/office/pub) and live
tournament context. Revised: **one dominant entry surface plus 2–3
obvious use cases**, everything else below fold.

| App | Today | After |
|---|---|---|
| Match Room | Hero + 4 route cards + board switcher + install + viral panels all visible on first load | Hero with **"Create room" + "Join room" + "Explore tournament"** as the dominant action trio. Route variety (friends/family/office/pub) shown as one row of chips beneath, not 4 large cards. Board switcher, install nudge, viral panels move below fold or appear contextually. |
| Crewtrip | Hero + 3-step guide + tournament stats grid + city preview + engagement panels | Hero + 3-step guide on first load. Tournament stats, engagement loop, city preview moved below fold until after first-time setup completes. |

**Files:** entry-page composition for each.

**Risk note.** For Match Room specifically: don't optimise away the
value proposition. The route variety + tournament context are *why*
people open the app. The fix is making them legible without making
them fight the primary action — chips below the action trio, not
competing cards above the fold.

**Ship criteria:**

1. First paint on iPhone SE shows hero + primary action(s) only
2. Match Room shows Create / Join / Explore trio visibly + route
   variety as a chip row beneath
3. All deferred content reachable via scroll or post-setup state
   transition
4. No content removed
5. UX Simplification Scorecard passes for both apps
6. Visual QA screenshots captured at 3 viewports, including
   first-time-user and returning-user states (Crewtrip's panel
   visibility depends on setup-complete flag)

---

## Phase 6.5 — Mevrouw IA spike (0.5 day, blocks Phase 7)

**Goal.** Map every current Mevrouw route to its post-restructure home
before any code is touched. Three days of implementation built on an
uncalibrated mental model will burn rework.

### Deliverable

A single table in this doc (added after the spike runs):

| Current route | Today's home | After-restructure home | Notes |
|---|---|---|---|

For each of: home, memories, gifts, todos, games, surprises, glosses,
schedule, journal, after-hours, plus any others surfaced by reading
the actual route tree at HEAD.

### Process

1. Read `apps/showcase-mevrouw/src/` route tree at HEAD (don't trust
   the audit summary — verify)
2. For each route: classify as **Primary** (Home / Schedule /
   Memories), **More-sheet** (everything else), or **Contextual**
   (accessed from inside a parent surface only)
3. Note any route that resists classification — those are the IA
   problems that need a product call before implementation
4. Get user sign-off on the table before Phase 7 starts

### Ship criteria

1. Table committed to this doc with every current route accounted for
2. No route classified as "?" — every route has a decided home
3. User has approved the mapping

---

## Phase 7 — Mevrouw full IA restructure (4 days)

**Pattern.** Mevrouw has 8+ top-level pages (memories, gifts, todos,
games, surprises, glosses, schedule, journal, after-hours) plus a
bottom tab bar + floating FAB + floating PulseInbox + install nudge.
Five floating/persistent surfaces compete on every screen.

**Fix.**

1. Bottom tab bar shows 4 primary tabs only: **Home / Schedule /
   Memories / More**. The "More" tab opens a sheet exposing all other
   nested routes (gifts, todos, games, surprises, glosses, journal,
   after-hours).
2. PulseInbox + FAB consolidate into a single "Action hub" surface
   that opens contextually, not floating-on-every-screen. Either:
   - Option A: collapse into a single FAB that opens an action sheet
     (PulseInbox messages as one section, quick-add actions as
     another).
   - Option B: PulseInbox lives in the Home tab header only, FAB stays
     contextual to Memories / Schedule where adding is the obvious
     intent.
3. Install nudge becomes a one-shot banner on first launch, dismissed
   forever after.

**Files:** main navigation + floating-component mounts.

**Risk note.** Mevrouw has the highest emotional content of any app in
the slate (couple sync, after-hours, surprises, journal). Hiding the
wrong thing — even temporarily — feels personal in a way that hiding a
banner in Recipe doesn't. Phase 6.5 IA spike is non-negotiable
prerequisite. Real-couple smoke before merge, not just real-phone.

**Ship criteria:**

1. Bottom tab bar ≤4 visible tabs on iPhone SE
2. At most one floating overlay visible at a time
3. Every nested route reachable in ≤2 taps from any tab
4. All existing features preserved — pure reorganisation
5. Phase 6.5 mapping table fully implemented, no route stranded
6. UX Simplification Scorecard passes
7. Visual QA screenshots at 3 viewports for every primary tab + the
   "More" sheet open + the contextual FAB/PulseInbox states
8. Real-couple smoke (user + partner on two phones) before merge

---

## Accessibility & PWA polish criteria (every phase)

Overflow menus, bottom tabs, sheets, deferred panels, and dismissed
banners must all meet:

- **Focus management** — opening a sheet moves focus inside; closing
  restores focus to the trigger
- **Keyboard reachability** — every interactive control accessible via
  Tab order, no keyboard traps
- **Safe-area padding** — `env(safe-area-inset-*)` honoured on all
  bottom-anchored controls (notch + home-indicator devices)
- **Touch targets ≥44×44 px** on every interactive element (Apple HIG)
- **Reduced motion** — `prefers-reduced-motion: reduce` disables
  sheet-slide / overlay-fade animations
- **Screen reader labels** — every icon-only control has
  `aria-label` or visible text; overflow menus announce as menus,
  bottom tabs as tablist
- **Keyboard-up state** — input-bearing screens (Recipe search, Tab
  amount, etc.) don't crop their primary action under the on-screen
  keyboard
- **PWA install/launch parity** — every fix must work identically in
  the installed PWA shell as in Safari

These are blocking ship criteria for every phase, not nice-to-haves.

---

## Cross-cutting opportunities

### Candidate primitives for `@shippie/showcase-ui` (design-system plan Phase 2)

These patterns repeat across this plan and are good extraction candidates:

- `<AlertSlot priority="..." />` — Phase 1
- `<BottomTabs items={[]} more={[]} />` with auto "More" overflow — Phase 3
- `<OverflowMenu>` — Phase 4
- `<DeferredPanel revealOn="scroll|setup-complete" />` — Phases 6, 7

Don't pre-extract — wait until 3+ apps have shipped each pattern, then
lift it once. (Per CLAUDE.md "three similar lines is better than a
premature abstraction.")

### Coordination with other plans

- **Consolidation plan Phase 1A** owns Coffee + Dough's *primary
  action* surface (single brew/schedule button). This plan's Phase 3
  owns the *navigation* beneath it. Ship 1A first.
- **Consolidation plan Phase 4** absorbs Meal Planner + Shopping +
  Pantry into Recipe. Recipe's banner consolidation (Phase 1 here)
  should happen *before* the absorption so the absorbed app inherits a
  clean alert pattern.
- **Design-system plan Phase 5** (per-app polish pass) is the natural
  next step after this plan ships — that's where each app gets scored
  on the 7-axis polish template.

---

## Suggested order of operations (revised)

| Order | Phase | Days | Why this order |
|---:|---|---|---|
| 1 | Phase 1 — banners | 1 | Highest-visibility first-paint improvement, cleanest pattern |
| 2 | Phase 2 — subtitles | 0.5 | Tiny effort, low risk, immediate visual cleanup |
| 3 | Phase 5 — game polish | 1 | Independent, ships fast |
| 4 | Phase 4 — toolbar collapse | 1.5 | Independent, frees room/active-screen real estate |
| 5 | **Phase 6.5 — Mevrouw IA spike** | **0.5** | **Don't leave the hardest IA problem unexamined. Spike now to surface product calls early; implementation lands at the end** |
| 6 | Phase 3 — nav restructure | 2.5 | Larger refactor; depends on consolidation 1A landing for Coffee |
| 7 | Phase 6 — hero deferral (Match Room + Crewtrip) | 2 | Most-watched apps; do after nav rulebook proven in Phase 3 |
| 8 | Phase 7 — Mevrouw full restructure | 4 | Built on Phase 6.5 mapping; largest single rework, highest visual impact |

**Total: ~13 days focused work**, spread across 8 independent
releases. Phases 1, 2, 5 are low-risk and could ship in the same week
provided the visual QA gate and scorecard are honoured.

**Key reorder rationale.** The Mevrouw IA spike at slot 5 (not 8)
prevents the worst failure mode — three days of implementation on an
uncalibrated mental model. The spike output gates Phase 7 but informs
the bottom-nav rulebook work in Phase 3 too (Mevrouw's "4 tabs +
More" pattern is the hardest case for the rulebook).

---

## Out of scope

- Already-polished apps (Voice Memo, Breath, Therapy Notes, Tab, Care
  Log, Co-Pilot, Site Visit, Cooking) — leave alone
- New features in any of the touched apps
- Design tokens / shared CSS infrastructure (covered in design-system
  plan)
- Data-layer changes / migrations (covered in consolidation plan)
- Performance / bundle-size work
- The 5 retired/folded apps from the consolidation plan (Sudoku,
  Memory Grid, Reaction → Daily Puzzle; Live Room, Show and Tell,
  Would You Rather → other homes)
