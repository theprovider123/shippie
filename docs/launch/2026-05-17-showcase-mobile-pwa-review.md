# 2026-05-17 - Showcase Mobile/PWA Review

Goal: launch with a smaller set of polished apps that prove Shippie: private by default, useful on a phone, resilient as a PWA, and clearly different from a cloud account product.

## Crewtrip Migration

Crewtrip is no longer a special local-only exception.

- `apps/showcase-crewtrip/shippie.json` now declares `data.mode = "shippie-documents"` with `trip-archive`, inherited recovery, snapshot migration, encrypted media, and the exact localStorage keys/prefixes Crewtrip currently owns.
- `apps/platform/src/lib/server/deploy/manifest.ts` no longer downgrades `crewtrip` to local-only defaults.
- `packages/sdk/src/wrapper/your-data-panel.ts` no longer skips Crewtrip in inherited private recovery.
- The app can still keep its current localStorage state machine while the wrapper captures a sealed safety document for cross-device handoff and recovery.

## Mobile/PWA Lens

The portfolio should feel like a native launcher full of tiny, durable utilities. The strongest apps have:

- One obvious first action within 2 seconds.
- Bottom or thumb-reachable navigation on phones.
- No marketing-style landing screen once launched.
- Clear offline/local copy behavior.
- Minimal mode count on the first screen.
- A reason to exist inside Shippie: private data, local AI, mesh, cross-app intents, or sealed recovery.

Common cleanup themes:

- Consolidate micro-loggers into richer daily surfaces instead of launching each as a separate app.
- Reduce the arcade shelf. Keep a few polished games that demonstrate haptics, daily play, or same-room play.
- Add explicit `data` policies to durable apps, especially SQLite/localStorage-heavy tools.
- Prefer bottom tabs or a single primary action over multi-panel desktop layouts.
- Remove in-app source links and dev copy from launch apps.
- Make install and recovery copy consistent: calm, short, and user-facing.

## Recommended Launch Shape

### Hero Proof Apps

These best explain Shippie and should be polished first:

| App | Why it belongs |
|---|---|
| Crewtrip | Social trip hub, sharing, media, local ownership, now migrated to inherited recovery. |
| Match Room | Timely 2026 social room, group play, live data, clear viral loop. |
| Recipe Saver | Local database, import/share, cooking mode, durable personal data. |
| Therapy Notes | Sensitive private notes, local-first health context, strong mobile tab model. |
| Symptom Diary | High-value sensitive health history, exportable, clear privacy wedge. |
| Cycle | Sensitive tracking plus optional partner sync. Strong Shippie fit. |
| Site Visit | Offline field workflow with photos/signatures/PDF, excellent PWA proof. |
| Voice Memo | Hold-to-record utility, local transcription story, very mobile-native. |
| Receipt Snap | Camera-first tool, private extraction, obvious phone use. |
| Snap and Forget | Camera memory/search utility, strong one-action mobile hook. |
| Mevrouw | Private two-phone space, relationship-specific mesh proof. |
| Tab | Same-table mesh bill split, practical and Shippie-specific. |
| Whiteboard | Same-room collaboration primitive. Keep, but simplify entry. |
| Drawing Telephone | Best room game because the room mechanic is the product. |
| Five Letter | Daily puzzle with share loop. Keep as one of very few daily games. |
| Quartet | Daily brain game with share loop, stronger than generic puzzle copies. |

### Useful Standalone Tools

Keep if they are simplified and made more mobile:

| App | Simplification |
|---|---|
| Lift | Make the first screen the set logger. Hide history/settings until needed. |
| Coffee | Keep as tactile kitchen timer/calculator. One brew action first. |
| Dough | Keep if schedule/back-timing is the first action. |
| Cooking | Rename toward Food Temps or fold into Recipe if it remains mostly lookup. |
| Breath | Keep only if it becomes the simple ritual entry point. Otherwise fold into Quiet. |
| Steep | Strong niche if positioned as medicinal tea notebook. Reduce visual density. |
| Ledger | Useful private tool, but archived status is right until mobile capture is sharper. |
| Touch | Strong private follow-up concept. Needs fewer CRM-like surfaces. |
| Care Log | High relevance, but needs calmer mobile information architecture. |
| Co-Pilot | High relevance, but needs a clearer launch name and single daily handover flow. |
| Journal | Strong Shippie fit. Needs mobile-first writing and recovery polish before launch. |

## Fold Or Remove Up To 10

These are the first 10 I would remove from the launch slate or fold into stronger apps.

| Priority | App | Recommendation | Fold target |
|---:|---|---|---|
| 1 | Tap Counter | Fold. Too small as a standalone launch app. | Daily quick log or Lift counters |
| 2 | Reaction | Remove or fold into arcade sampler. Generic, low Shippie relevance. | Arcade pack |
| 3 | Memory Grid | Fold. Generic cognitive mini-game. | Daily Puzzle / brain games |
| 4 | Sudoku | Fold. Useful but undifferentiated without a stronger Shippie proof. | Daily Puzzle / brain games |
| 5 | Would You Rather | Fold. Better as room prompt content. | Crewtrip / Match Room / Drawing Telephone |
| 6 | Live Room | Fold. Match Room supersedes the host/guest social-room story. | Match Room |
| 7 | Show and Tell | Fold. The ephemeral-room idea is good, but separate app feels thin. | Whiteboard / Live Room replacement |
| 8 | Meal Planner | Fold. Planning belongs with recipes, pantry, and household flow. | Recipe / Hearth |
| 9 | Shopping List | Fold. Useful, but should be a mode inside a household/recipe app. | Hearth / Recipe |
| 10 | Restaurant Memory | Fold. Places/memories are stronger inside trip or personal memory tools. | Atlas / Crewtrip / Snap and Forget |

Near-miss consolidation candidates: Colour of the Day into Quiet, Sip Log into Coffee/health daily summary, Pantry Scanner into Recipe/Hearth, Body Metrics into Symptom Diary or a private health suite.

## Full Ranking

Scores are directional: usefulness to users, relevance to Shippie, and mobile/PWA launch readiness.

| Rank | App | Verdict | Mobile/PWA simplification |
|---:|---|---|---|
| 1 | Crewtrip | Launch hero | Keep the day timeline clean, default to Now, hide host admin depth behind one drawer. |
| 2 | Match Room | Launch hero | Reduce landing choices after profile setup; resume latest room first. |
| 3 | Recipe Saver | Launch hero | Keep list/cook/edit as three flows; make recovery status visible but quiet. |
| 4 | Therapy Notes | Launch hero | Keep bottom tabs; reduce worksheet choices on first run. |
| 5 | Symptom Diary | Launch hero | Make "log symptom" the dominant first action; export as secondary. |
| 6 | Site Visit | Launch hero candidate | Start on active report; keep PDF/export tucked away until report complete. |
| 7 | Cycle | Launch hero candidate | Keep partner sync opt-in and visually separate from private tracking. |
| 8 | Voice Memo | Launch hero candidate | Make hold-to-record full-screen; move archive/search below. |
| 9 | Receipt Snap | Launch hero candidate | Camera first, manual correction second, history third. |
| 10 | Snap and Forget | Launch hero candidate | One capture button, then automatic labeling/search. |
| 11 | Mevrouw | Keep | Shorten onboarding and make paired/unpaired status impossible to miss. |
| 12 | Tab | Keep | Make "create/join bill" the only first screen choice. |
| 13 | Whiteboard | Keep | Start drawing immediately; move room controls to the platform drawer or a small sheet. |
| 14 | Drawing Telephone | Keep | Keep room setup playful, but reduce lobby copy and mode choices. |
| 15 | Five Letter | Keep | Strong daily loop; polish keyboard and share result states. |
| 16 | Quartet | Keep | Strong daily loop; keep archive hidden until after first solve. |
| 17 | Lift | Keep | First screen should be current workout/set logger, not a dashboard. |
| 18 | Coffee | Keep | Single brew action first; presets/history in bottom sheet. |
| 19 | Dough | Keep | Start with dough amount and schedule time; hide advanced formulas. |
| 20 | Cooking | Keep or fold | If kept, make it a phone-friendly temperature/timer lookup. |
| 21 | Breath | Keep or fold | Make one-tap start the default; fold broader mood/focus into Quiet later. |
| 22 | Steep | Keep niche | Simplify to blend, timer, notes. |
| 23 | Care Log | Defer/polish | Valuable, but needs sensitive-data recovery and calmer daily view. |
| 24 | Co-Pilot | Defer/polish | Valuable, but rename and reduce to handover/today/records. |
| 25 | Journal | Defer/polish | Strong Shippie fit, but needs mobile writing polish and launch metadata refresh. |
| 26 | Ledger | Defer | Useful, but manual finance capture needs sharper mobile entry. |
| 27 | Touch | Defer | Useful, but too CRM-like. Make it a small personal follow-up loop. |
| 28 | Pantry Scanner | Fold/defer | Camera utility is strong, but should likely feed Recipe/Hearth. |
| 29 | Photo a Day | Fold/defer | Nice daily ritual, but overlaps Snap and Forget/Journal. |
| 30 | Body Metrics | Fold/defer | Sensitive and relevant, but better inside private health suite. |
| 31 | Habit Tracker | Fold | Auto-check proof belongs in Daily, not a standalone grid. |
| 32 | Hearth | Defer | Good consolidation target for household apps, but not launch-ready enough. |
| 33 | Atlas | Defer | Strong future app, but archived and needs map/place scope clarity. |
| 34 | Read Later | Defer | Useful, but less unique than camera/health/social proofs. |
| 35 | Pitch Forge | Defer | Creative utility, but Shippie relevance depends on local AI polish. |
| 36 | Story Studio | Defer | Charming, but needs a stronger family sharing demo. |
| 37 | Snake | Keep game | Polished classic; now has score share and visible platform chrome. |
| 38 | Stack | Keep game candidate | Stronger than most arcade games if mobile controls are excellent. |
| 39 | Chess | Keep game candidate | Useful but generic; keep only if PGN/export/offline story is polished. |
| 40 | Daily Puzzle | Fold/keep | Keep if it becomes the umbrella for Sudoku/Memory Grid/Reaction. |
| 41 | Lustre | Defer game | Good polish, but less Shippie-specific than daily/room games. |
| 42 | Block Drop | Defer game | Fun, but one of many arcade clones. |
| 43 | Bricks | Defer game | Fun, but not launch-critical. |
| 44 | Crossing | Defer game | More complex than its launch value justifies. |
| 45 | Drift | Defer game | Fun, but overlaps arcade shelf. |
| 46 | Maze | Defer game | Fun, but generic. |
| 47 | Invaders | Defer game | Fun, but generic. |
| 48 | Bulwark | Defer game | Ambitious, but complexity is high for launch proof. |
| 49 | Colour of the Day | Fold | Fold into Quiet or Journal as mood color. |
| 50 | Quiet | Fold/replace | Make this the merged ritual app, not a separate weak surface. |
| 51 | Move | Fold/replace | Fold into Lift or rebuild as private recovery. |
| 52 | Sip Log | Fold | Caffeine/hydration signals should feed Coffee/health daily summary. |
| 53 | Meal Planner | Fold | Fold into Recipe/Hearth. |
| 54 | Shopping List | Fold | Fold into Recipe/Hearth. |
| 55 | Restaurant Memory | Fold | Fold into Atlas/Crewtrip/Snap and Forget. |
| 56 | Show and Tell | Fold | Fold into Whiteboard or room content. |
| 57 | Live Room | Fold | Fold into Match Room. |
| 58 | Tap Counter | Fold/remove | Too small as standalone. |
| 59 | Reaction | Remove | Too generic. |
| 60 | Memory Grid | Fold/remove | Too generic. |
| 61 | Sudoku | Fold/remove | Too generic unless Daily Puzzle owns it. |
| 62 | Would You Rather | Fold/remove | Better as room prompt content. |

## Category-Level Simplifications

### Games

Launch with fewer games:

- Daily brain: Five Letter, Quartet, maybe one Daily Puzzle umbrella.
- Room game: Drawing Telephone.
- Classic tactile: Snake, maybe Stack.
- Defer the arcade-cabinet shelf until the core app story lands.

### Food

Keep Recipe as the hub. Coffee, Dough, and Cooking can stay if each is a one-screen tactile tool. Meal Planner, Shopping List, Pantry Scanner, and Restaurant Memory should feed Recipe/Hearth rather than stand alone at launch.

### Health

Lead with Therapy Notes, Symptom Diary, Cycle, Lift, and maybe Breath. Fold Body Metrics, Sip Log, Colour of the Day, Quiet, and Move into a smaller health suite unless each gets a sharper first action.

### Social/Room

Lead with Crewtrip, Match Room, Tab, Mevrouw, Whiteboard, and Drawing Telephone. Fold Live Room and Show and Tell into those surfaces.

### Tools/Creative

Lead with Voice Memo, Receipt Snap, Snap and Forget, and Site Visit. Defer Pitch Forge, Story Studio, Read Later, Ledger, Touch, and Atlas unless launch messaging needs those exact categories.

## Immediate Polish Backlog

1. Add explicit `data` policies to every durable first-party app.
2. Normalize mobile first screens: one primary action, one secondary action, no desktop dashboard as default.
3. Move advanced controls into bottom sheets or drawers.
4. Ensure every launch app has a calm Your Data path and install/recovery copy.
5. Use the platform share/options panel as the default share surface, with in-app result sharing only where the result itself matters.
6. Real-device smoke the final slate on iPhone Safari and Android Chrome before adding more apps.
