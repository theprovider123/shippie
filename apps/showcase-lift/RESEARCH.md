# Lift — research & brand direction

Grounding notes for the Lift showcase: what strength lifters actually need
between sets, how the category retains, and where a private, offline,
local-canonical Shippie app wins. Written to steer build decisions, not as
marketing.

## 1. The category, briefly

| App | Core idea | Where it's strong | Where it leaks |
|---|---|---|---|
| **Strong** | Fast manual logger | Two-tap-ish set entry, plate math, rest timer | Paywalled history depth; cloud account required |
| **Hevy** | Strong + a social feed | Clean UI, routines, sharing | Feed/vanity creep; account + cloud |
| **Boostcamp / Juggernaut / 5/3/1 apps** | Program-first | Real periodisation, progression rules baked in | Rigid; weak as a free-form logger |
| **RP Hypertrophy** | Autoregulated volume | RIR-driven set progression, fatigue management | Opinionated, subscription, narrow |
| **FitNotes (Android)** | Offline notebook | Genuinely offline, free, fast | Dated UI; no programming/analytics |
| **Paper notebook** | The incumbent | Zero friction, zero latency, fully private | No math, no history search, no PR memory |

The honest competitor isn't another app — it's the **notebook + a calculator**.
Anything Lift adds has to beat the notebook *on speed first*, then earn its
keep with math the notebook can't do (e1RM, PR memory, plate solve, load
ratio) without ever getting slower than writing a number down.

## 2. User jobs (job-to-be-done framing)

1. **"Log this set in the 3 seconds before I re-rack."** The critical path.
   Weight + reps + save, thumb-reachable, no scrolling, no modal. Everything
   else is secondary to not breaking this.
2. **"Tell me what to lift today."** Pull up the program / last session and
   show the target and the suggested next load. Remove the "what was I doing?"
   tax.
3. **"Did I actually get stronger?"** Plain-language progression + e1RM trend,
   honest when the data is thin.
4. **"How much do I load on the bar?"** Plate math, per side, for *this* gym's
   plate set.
5. **"Am I digging a hole?"** Fatigue / strain / load-ratio so a hard block
   doesn't quietly become an injury.
6. **"Keep my data mine."** Export, no account, works in a basement with no
   signal.

## 3. What makes mid-session logging fast enough

- **Default to the last working set.** Pre-fill weight×reps from history so
  most logs are one tap (Save) or two (bump + Save).
- **Big, fixed-position controls.** `±1 / ±5` pills, 44px+ targets, numerals
  in fixed-width mono so the layout never reflows under your thumb.
- **No-scroll critical path.** The set card, rest timer, and Save sit above
  the fold during a workout. History/analytics are a different tab.
- **Wake lock + haptic confirm.** Screen stays on between sets; a buzz
  confirms the save so you don't have to look twice.
- **Offline-absolute.** The log must never spin on a network call. Local DB is
  canonical; sync (if any) is a background nicety.
- **RPE/RIR optional, never required.** A single chip row that defaults to
  unset — autoregulation for those who want it, zero friction for those who
  don't.

## 4. Engagement loops & retention drivers

- **Session loop:** open → see target/suggestion → log sets → rest timer →
  PR ceremony when earned → finish → load-ratio readout. The PR moment and the
  "you're cleared / hold today" readiness line are the dopamine, kept honest.
- **Weekly loop:** consistency streak + volume/intensity trend + muscle-group
  split. Streaks are the single strongest retention lever in logging apps —
  but we frame them as *consistency*, not gamified confetti.
- **Program loop:** progression rules turn "what weight?" into a decision the
  app already made, so the next session has momentum. Stalls trigger a deload
  instead of silent grinding — which keeps people training instead of quitting
  hurt.
- **Cross-app loop (Shippie-only):** sleep/fuel/cycle signals from sibling apps
  feed a readiness score that tunes today's load. The reason to open Lift is
  reinforced by data it never had to collect itself.

## 5. Shippie-specific advantages

- **Local-canonical, offline-first by construction.** wa-sqlite/OPFS on the
  device. The basement-gym case is the default case, not an edge case.
- **No account, no cloud dependency.** The notebook's privacy, with math.
- **Cross-app intents without surveillance.** Lift *consumes* `sleep-logged`,
  `nutrition-logged`, `protein-target-hit`, `hydration-logged`,
  `caffeine-logged`, `cycle-logged`, `body-metrics-logged` over a same-origin
  postMessage bus and scores readiness **on-device**. A cloud app could only do
  this by pooling your whole life on a server. Lift never sees the data leave
  the phone.
- **Sealed-cloud spaces for opt-in coaching.** A coach can be granted read
  access through a sealed space — never required, never the default, fully
  revocable. The free-form private logger is the product; coaching is a door
  you can choose to open.
- **Data passport.** `lift.v1` export is a first-class feature, not a
  retention-hostile afterthought.

## 6. Brand direction

Lift must read as a different *object* from its Shippie siblings:

- **Palate** — warm, editorial, appetite-driven.
- **Chiwit** — soft, friendly daily companion.
- **Cycle** — calm, organic, body-attuned.
- **Nutrition** — clean, clinical, quantified.

**Lift is the chalk bucket and the knurling.** Focused, tactile, strong,
high-contrast, utilitarian. The opposite of a social-feed fitness app.

Principles in force in the build:

- **Tactile & strong.** Big mono numerals (IBM Plex Mono), heavy weights, the
  set card as a physical-feeling control surface. The numeral *is* the hero.
- **High-contrast & legible at arm's length.** Sweaty hands, bad gym lighting,
  phone on a bench a metre away. Four themes are *lighting conditions*, not
  decoration: **Iron** (halogen dark), **Chalk** (bright notebook), **Clay**
  (warm), **Signal** (high-visibility).
- **Utilitarian, not macho.** No flexing avatars, no leaderboards, no clutter.
  Strength, not aesthetics-of-strength.
- **Honest over impressive.** "No clear trend yet — log 2 more sessions" beats
  a fabricated chart. e1RM is a *trend line*, labelled as an estimate, never a
  bragging number. Readiness stays supportive, never punitive; cycle phase
  informs, never shames.
- **Quiet ceremony.** The PR burst and the readiness line are the only moments
  that get to be loud, and only when earned.

Anti-patterns explicitly rejected: social feeds, vanity dashboards, streak
confetti, macho copy, generic gym-template chrome.
