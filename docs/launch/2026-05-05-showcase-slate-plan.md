# 2026-05-05 - Showcase Slate Build Plan

> Turn Shippie's showcase library from "many useful demos" into a focused
> proof set for Wrap, Run, Connect, privacy, offline, mesh, and cross-app
> intents.

## Decision

Build toward a launch slate where every app answers:

> Why does this need a cloud company?
>
> It does not. Shippie lets the user's device, nearby devices, and their own
> chosen backup path do the work.

Keep **Coffee**, **Dough**, and **Cooking / food temps** as separate apps for
now. They are small, but they are distinct tactile kitchen tools and should not
be collapsed into Field Kitchen until the existing standalone versions have
been polished and measured.

## Source Of Truth Problem

The source tree currently contains 25 showcase apps:

- body-metrics
- breath
- coffee
- cooking
- daily-briefing
- dough
- habit-tracker
- journal
- live-room
- matchday
- meal-planner
- mevrouw
- mood-pulse
- pace
- pantry-scanner
- pomodoro
- read-later
- recipe
- restaurant-memory
- shopping-list
- show-and-tell
- sip-log
- sleep-logger
- whiteboard
- workout-logger

Before new work starts, reconcile these surfaces:

- `apps/showcase-*`
- `apps/platform/src/lib/_generated/showcase-catalog.ts`
- `apps/platform/src/lib/container/state.ts`
- `docs/CURRENT_STATE.md`
- `docs/launch/seeing-the-apps.md`
- marketplace seed/catalog data

The container, docs, marketplace, and source folders must agree on app names,
slugs, ports, intents, categories, and launch status.

## Launch Slate

### Keep And Polish

These already prove Shippie primitives and should be launch-grade:

| App | Why it stays | Primary proof |
|---|---|---|
| Mevrouw | Intimate two-device private space | encrypted mesh + privacy |
| Journal | Local AI on personal text | on-device sentiment/classify |
| Recipe | Offline personal library | local DB + signed sharing |
| Pantry Scanner | Camera + food inventory | on-device vision + local data |
| Live Room | Same-room multiplayer | proximity + first-buzzer fairness |
| Whiteboard | Low-latency collaboration | proximity drawing |
| Show and Tell | Ephemeral local sharing | mesh room lifecycle |
| Body Metrics | Sensitive local photos | local files + camera privacy |
| Read Later | Local article capture | SSRF-guarded fetch + offline reading |

### Build Or Consolidate

| App | Build shape | Notes |
|---|---|---|
| Daily | finish | The face of the cross-app intent graph. Not optional. |
| Quiet | merge Breath + Pomodoro + Mood Pulse | One ritual surface; keep original folders until replacement ships. |
| Move | merge Pace + Workout Logger + Sleep Logger | Training, planning, and recovery in one app. |
| Hearth | new | Household mesh: chores, maintenance, shared notes, household list. |
| Handover | new | Renamed from Co-Pilot. Co-parent schedule, meds, handover notes. |
| Cycle | new | Local-only menstrual/fertility tracker. |
| Symptom Diary | new | Chronic-illness symptoms, triggers, meds, PDF export. |
| Atlas | new | Offline trip/hike companion: pins, notes, photos, trip share. |
| Ledger | new | Manual-first private expenses, CSV export, no bank aggregation. |
| Between Sessions | new, optional | Therapy/CBT notes without clinical claims or therapy replacement framing. |
| Matchday Crowd | build separately | Stadium-scale gossip/aggregation; distinct from Live Room content packs. |

### Keep Separate For Now

| App | What to improve | Why not merge yet |
|---|---|---|
| Coffee | polish ratio dial, beans, brew history, caffeine intent | Strong tactile single-purpose demo. |
| Dough | polish schedule/back-timing, baker percentages, ready intent | Distinct baking calculator with real offline value. |
| Cooking | rename UI toward Food Temps if useful; polish temps/timers | Different job from recipes and dough. |
| Sip Log | decide after Quiet/Move | Could become Hydration or stay a one-tap micro-logger. |

### Retire Or Fold

| Current app | Plan |
|---|---|
| Habit Tracker | Fold into Daily, with auto-checks remaining as the proof. |
| Meal Planner | Fold into Hearth or Recipe/Pantry planning flow after intent audit. |
| Shopping List | Fold into Hearth or keep only if mesh-shopping is a headline demo. |
| Restaurant Memory | Fold into Atlas as "places" unless a strong dining-specific story appears. |
| current Matchday | Fold into Live Room as a sport/pub quiz content pack. |

## Phases

### Phase 0 - Truth And Catalog Reconciliation

**Goal:** one canonical launch inventory.

- Generate a machine-readable showcase inventory from source folders.
- Diff it against container state, generated catalog, docs, and marketplace seed data.
- Fix stale virtual entries and missing real entries.
- Assign each app a status: `launch`, `merge-source`, `retire`, `new`, `defer`.
- Normalize `shippie.json` schema fields across all showcases.
- Add an intent graph test that fails when docs/container/catalog drift from source.

**Acceptance:**

- `bun run health` or equivalent typecheck/test/build gate passes.
- `docs/launch/seeing-the-apps.md` lists every canonical dev app and port.
- No app appears in the container that has no source folder unless explicitly marked virtual/deferred.

### Phase 1 - Polish The Proof Apps

**Goal:** the existing strongest apps feel real on a phone.

- Mevrouw: pairing clarity, sync state, offline reconnect, export/delete proof.
- Journal: local AI status, sentiment trend, signed share/export, no-cloud copy.
- Recipe: signed share/import polish, cooking mode, offline storage proof.
- Pantry Scanner: camera fallback, model loading state, confidence display.
- Body Metrics: camera/photo store polish, time-lapse, export/delete.
- Live Room: content pack model, latency/audit overlay, two-phone test script.
- Whiteboard: latency overlay, reconnect, clear-room behavior.
- Show and Tell: auto-clear reliability, room-empty state, media limits.
- Read Later: proxy error states, offline article proof, local delete/export.

**Acceptance:**

- Each launch app earns or can emit proof events for the primitives it claims.
- Each app has a short demo path documented in the real-phone checklist.
- Each app has stable empty/loading/error/offline states.

### Phase 2 - Build The Three Composed Apps

**Daily**

- Consume every launch-intent stream.
- Show "today", "this week", and "why this matters" summaries.
- Surface intent provenance so the user sees which app produced each fact.
- Provide privacy controls for hiding an app from Daily.

**Quiet**

- Merge Breath, Pomodoro, and Mood Pulse into one ritual app.
- Preserve intents: `mindful-session`, `focus-session`, `mood-logged`.
- Add a simple local trend: focus/mood/breath sessions over time.
- Keep old apps runnable until Quiet proves parity.

**Move**

- Merge Pace, Workout Logger, and Sleep Logger.
- Preserve intents: `run-planned`, `workout-completed`, `sleep-logged`.
- Add weekly load and sleep/caffeine/workout correlations.
- Avoid Strava-style social surface; the wedge is private recovery.

**Acceptance:**

- Existing consumer/provider intent tests still pass.
- Quiet and Move replace their source apps in the launch slate only after feature parity.
- Daily proves at least five cross-app correlations from real user actions.

### Phase 3 - New Privacy-First Personal Apps

Build in this order:

1. Cycle
2. Ledger
3. Symptom Diary
4. Atlas
5. Handover
6. Hearth
7. Matchday Crowd
8. Between Sessions, if launch energy remains

**Cycle**

- Local-only cycle log, symptoms, notes, predictions, export/delete.
- Optional partner-share must be explicit and revocable.
- No clinical claims beyond tracking and personal context.

**Ledger**

- Manual transaction capture, categories, monthly view, CSV export.
- Optional receipt photo stored locally.
- No Plaid, no bank scraping, no cloud account promise.

**Symptom Diary**

- Symptoms, triggers, medication, severity, trend view, PDF export.
- Doctor handoff should be a generated file, not an account integration.
- Can consume sleep, mood, workout, food/caffeine intents where useful.

**Atlas**

- Trip folders, pins, notes, photos, offline-first timeline.
- MVP does not need full map licensing complexity; start with saved places and local media.
- Mesh-share trip notes with companions after MVP.

**Handover**

- Two-home calendar, meds, school/appointment notes, handover log.
- Position as private coordination, not court tooling.
- Exportable records, but no legal/admissibility claims.

**Hearth**

- Household shared list, chores, maintenance reminders, fridge/pantry hooks.
- Mesh household pairing.
- May absorb Meal Planner and Shopping List after their intent flows are preserved.

**Matchday Crowd**

- Additive poll/report aggregation with gossip topology.
- Must not reuse Live Room's host/guest first-buzzer logic.
- Initial demo can be a venue/school/civic poll, not full stadium scale.

**Between Sessions**

- CBT worksheets, check-ins, notes, PDF export.
- Avoid "therapy replacement" language.
- Keep all inference local and disclose model status plainly.

### Phase 4 - Kitchen Standalone Pass

**Goal:** keep the kitchen tools separate but make each one worthy.

- Coffee:
  - ratio dial
  - bean presets
  - brew timer/history
  - caffeine intent
  - Daily/Sleep correlation
- Dough:
  - baker percentages
  - schedule generator
  - ready timer
  - dough-ready intent
- Cooking:
  - food temp lookup
  - timer/checklist
  - cooking-now and cooked-meal intents
  - clear naming: "Cooking" externally or "Food Temps" if the UI is mostly temperature guidance
- Sip Log:
  - decide whether to keep as hydration/caffeine micro-logger
  - if kept, make it fast enough to justify a home-screen slot
  - if retired, preserve `hydration-logged` and `caffeine-logged` via Quiet, Move, Daily, or Coffee

**Acceptance:**

- The kitchen apps remain installable separately.
- They share visual/system polish but not one merged app shell.
- Daily can explain how kitchen events affected sleep, mood, habits, or shopping.

### Phase 5 - Retire, Redirect, And Explain

**Goal:** avoid ghost apps and confusing duplicates.

- Add an explicit retired-app map for old standalone slugs.
- Teach the showcase preparation script to remove orphan baked dirs.
- Redirect retired slugs to their replacement app with a short migration state.
- Preserve user data export before hiding an app from the default slate.
- Update marketplace categories to show launch apps first and retired apps only behind a dev/debug toggle.

**Acceptance:**

- No retired app appears as a first-class marketplace install.
- Existing local data can be exported before replacement.
- No stale `/run/<slug>/` ghost survives a build/deploy.

### Phase 6 - Real-Device Proof And Launch Assets

**Goal:** earn the claims publicly.

- Two-phone Live Room video with measured latency.
- Whiteboard same-room draw video with latency overlay.
- Mevrouw pairing/sync/reconnect video.
- Journal local AI video showing backend/source.
- Daily cross-app graph video: cook, workout, sleep, mood, then summary.
- Your Data export/delete/restore clip.
- Offline mode clip for Recipe or Atlas.

**Acceptance:**

- Every launch claim has code, proof event, screenshot, or video evidence.
- Public launch copy uses measured language only.
- Docs and marketplace descriptions match what the runtime proves.

## Workstreams

### Platform

- catalog reconciliation
- proof badge coverage
- retired-slug redirects
- container app switcher polish
- intent graph integrity tests
- local export/restore flow

### Existing Showcases

- polish existing launch pillars
- compose Daily, Quiet, Move
- preserve separate Coffee, Dough, Cooking
- deprecate/fold only after replacement parity

### New Showcases

- use the showcase scaffold for new builds
- share micro-logger/table/export primitives
- keep each app's first version intentionally narrow
- avoid regulated/clinical/legal claims in copy

### Launch

- real-phone checklist
- demo scripts
- marketplace metadata
- whitepaper references
- measured proof claims

## Priority Stack

1. Catalog reconciliation
2. Daily
3. Existing proof-app polish
4. Quiet and Move
5. Cycle and Ledger
6. Symptom Diary and Atlas
7. Handover and Hearth
8. Kitchen standalone polish
9. Matchday Crowd
10. Between Sessions
11. Retire/fold duplicates
12. Real-device launch assets

## Non-Goals

- Do not merge Coffee, Dough, and Cooking into Field Kitchen yet.
- Do not promise stadium-scale Matchday until a smaller venue proof works.
- Do not make legal, clinical, fertility, or therapeutic claims beyond personal tracking/export.
- Do not add cloud accounts to make apps feel more complete.
- Do not let the number of apps matter more than proof quality.

## Definition Of Done

The slate is launch-ready when:

- the catalog has one source of truth
- every launch app has a crisp Shippie primitive
- retired/merged apps are not visible as confusing duplicates
- Daily demonstrates the cross-app graph in one screen
- local export/delete is visible for sensitive apps
- at least three real-device videos prove Connect, Run/local AI, and offline/local data
- launch docs, marketplace copy, and runtime behavior agree
