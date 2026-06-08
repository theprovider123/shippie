# Companion refactor and simplification plan

## Goal

Companion should feel like a calm digital trip sitter: private, grounded, very simple when someone needs help, and more present only if they chose that before the session began.

The current app has strong foundations: local-first storage, a safety gate, preparation checklist, anchor message, contact support, timeline phases, mood check-ins, grounding sheets, and integration history. The next level is not more features. It is reducing the live cognitive load and making the whole flow feel like one coherent companion rather than a dashboard.

## Product thesis

Companion is not a psychedelic planner, dosing tool, therapist, or live AI oracle. It is a harm-reduction support surface for three moments:

- Before: make the room safe and choose the companion's presence level.
- During: one phrase, one breath, one way to ask for help.
- After: collect fragments without forcing meaning.

## User scenarios

These are the real scenarios the app should be judged against:

- Calm setup: someone is sober, preparing alone or with a trusted person, and wants to make future panic less likely. They need a short setup, not an intake form.
- Quick reassurance: someone opens the app mid-session because things feel big. They need one steady sentence and obvious grounding actions.
- Overstimulation: visuals, motion, or long text make things worse. They need Minimal mode: almost no interface, just plain words.
- Hard moment: someone taps `Hard`. The app should not dramatize the moment. It should open their anchor, keep Help reachable, and use plain, stabilizing copy.
- Real danger: someone has physical danger signs or self-harm risk. The app should clearly route to their trusted person or emergency help.
- Coming back: later, when they are calmer, they can write fragments and save one small next step without being pushed to over-interpret.

Scenario acceptance checks:

- A first-time user can understand the safety gate in one screen.
- A user can start a session immediately after the safety threshold, even with no prep details filled in.
- Missing anchor/contact/emergency details are guidance only; they never block the trip support surface.
- Minimal / Simple / Vivid applies to the whole app surface after selection: header, tabs, setup panels, sheets, integration, and history, not just the live trip screen.
- During mode has no tab nav; the current mode word is the only in-trip mode toggle.
- Minimal mode renders no orb, canvas, animation, phase label, elapsed clock, or mood-detail microcopy.
- `Hard` never frames distress as necessary or meaningful.
- Help copy separates intense-but-not-dangerous feelings from emergency signs.
- The app remains useful offline and private by default.

## Visual thesis

Plain dark support, not ceremony and not wellness SaaS. Use system typography, short utility copy, charcoal, amber, sage, and rose as the core palette. Reserve psychedelic colour for Vivid mode only. The UI should feel grounded, direct, and low-friction, with very little chrome during the trip.

Inspiration to keep from the HTML prototype:

- `Set the room before the room changes.` remains the central Prepare line.
- Presence levels move into Prepare.
- Minimal / Simple / Vivid is the right three-tier model.
- The chosen level is a global presence setting. Prepare, sheets, Integration, and History should visibly inherit it so the user never feels the app changes personality only after the trip starts.
- Simple mode should center the amber breathing orb.
- Vivid mode must look materially different: psychedelic colour field, patterned orb, and visible motion, not just the Simple layout with a different label.
- Ground / Breathe / Anchor / Help stay as the core during-session tools.

Things to avoid from both current app and prototype:

- Heavy live aesthetic switching during a trip. The mode word itself may cycle Minimal / Simple / Vivid because it is small, reversible, and useful when visuals become too much.
- The word `Kaleidoscope` as user-facing mode copy.
- Purple gradient wellness-product styling.
- Long dashboard-like Prepare screens.
- Decorative serif typography or mystical phrasing.
- Overly heroic or mystical distress copy.

## Current review

### What is working

- The safety gate and local-first framing are responsible and necessary.
- Prepare has the right harm-reduction ingredients.
- The phase and mood logic in `phase.ts` is useful and testable.
- The During screen already has a strong center: orb, phase line, felt-state taps, and grounding tools.
- The anchor sheet and help panel are product-critical.
- Integration has the right tone: fragments first, meaning later.

### What is confusing

- The top nav makes the app feel like a multi-tab admin tool.
- The global Simple/Kaleidoscope toggle is too prominent and appears in the safety gate, header, and During.
- The current binary mode model cannot express the desired Minimalist option.
- Prepare shows too much at once: checklist, intention, anchor, Prepare AI, timeline calibration, phase timeline, contact fields, seven caution chips, acknowledgement, missing-items list.
- `Prepare AI / before only` is conceptually right but the label makes the product feel more technical than supportive.
- History is too visible for a first-session user.

### Safety copy issue

Do not use copy like `Hard moments are where the real shift happens.` It can accidentally romanticize distress. Hard-state copy should stay plain:

> This is hard. You do not need to solve it. It will change.

## Target flow

### 1. Safety gate

Keep it mandatory, but make it a calm threshold.

Recommended content:

- Companion
- One short description: `Private trip support for preparation, grounding, and coming back.`
- Three acknowledgements:
  - I am of legal age where I am.
  - I understand this is harm-reduction support, not medical care.
  - If danger signs appear, I will contact real-world help.
- Primary action: `Enter`

Remove presence selection from the gate. It belongs in Prepare.

### 2. Prepare

Prepare should become a short guided setup, not a long form. It should never withhold the trip support surface because someone skipped details.

Primary sections:

- Presence: Minimal / Simple / Vivid
- Room: five set-and-setting checks
- Anchor: message from calm self to tripping self
- Help: trusted person and emergency number
- Start

All of these are recommended, not required. If the user starts without them, During uses calm fallback copy and Help explains real-world escalation without fake empty call links.

Secondary details should be disclosed behind `More setup`:

- Intention
- Timeline calibration
- Substance type and amount note
- Medication / condition cautions

This preserves harm-reduction logic without making the main path feel like paperwork.

Presence behavior:

- Selecting Minimal immediately simplifies the whole Prepare surface: plain dark panels, reduced motion, no psychedelic preview animation.
- Selecting Simple returns the warm amber companion language.
- Selecting Vivid immediately shifts the whole app into the psychedelic layer, including header, cards, controls, sheets, and later integration/history surfaces.

### 3. During

During should open in the chosen presence level. The mode word can be tapped to cycle Minimal / Simple / Vivid during the session, so someone can strip the experience back or move into Vivid without leaving the support surface.

Shared structure:

- Subtle phase label
- Tappable mode word
- One central reassurance line
- Optional normalizing line, only in Simple/Vivid
- Felt-state taps: Gentle / Intense / Hard
- Tool rail: Ground / Breathe / Anchor / Help
- Very quiet close action

Presence modes:

- Minimal: text only, no orb, no animation, no phase label, no elapsed clock, no small detail labels. Best for overstimulation.
- Simple: amber breathing orb, one reassurance, one normalizing sentence.
- Vivid: full-surface colour field and richer orb, but same calm controls.

Hard-state behavior:

- Log the hard check-in.
- After a short delay, open Anchor.
- Make Help visually available, but do not panic the screen.
- Copy stays reassuring and plain.

### 4. Integrate

Keep this very soft:

- `Welcome back.`
- Intention recap
- Mood trail
- One freeform text area: `What came up?`
- One small carry-forward prompt
- Save

History can live behind a small `Past sessions` link after a session is saved.

## Data model refactor

Replace the current split mode model:

```ts
visualMode: 'grounded' | 'kaleidoscope'
motionMode: 'full' | 'reduced'
detailMode: 'full' | 'simple'
```

with:

```ts
presenceLevel: 'minimal' | 'simple' | 'vivid'
```

Migration rules:

- old `visualMode: 'kaleidoscope'` -> `presenceLevel: 'vivid'`
- old grounded/simple state -> `presenceLevel: 'simple'`
- missing state -> `presenceLevel: 'simple'`

Keep future room for accessibility overrides separately:

```ts
accessibility: {
  reduceMotion: boolean;
}
```

Minimal mode should never depend on only `prefers-reduced-motion`; it is a product choice, not just an accessibility setting.

## Code refactor plan

Split `apps/showcase-companion/src/App.tsx` into focused modules:

- `App.tsx`: state wiring and high-level routing only
- `components/SafetyGate.tsx`
- `components/PrepareScreen.tsx`
- `components/DuringScreen.tsx`
- `components/PresencePicker.tsx`
- `components/during/MinimalPresence.tsx`
- `components/during/SimplePresence.tsx`
- `components/during/VividPresence.tsx`
- `components/sheets/GroundSheet.tsx`
- `components/sheets/BreatheSheet.tsx`
- `components/sheets/AnchorSheet.tsx`
- `components/sheets/HelpSheet.tsx`
- `components/IntegrateScreen.tsx`

Move logic into small files:

- `presence.ts`: labels, mode metadata, migration helpers
- `readiness.ts`: optional setup guidance copy
- `safety.ts`: caution metadata and warning copy
- `copy.ts`: during-state guidance strings

Keep `phase.ts` mostly intact, but soften user-facing copy where needed.

## CSS refactor plan

Keep one CSS file for now, but reorganize it around product surfaces:

- tokens
- base shell
- app-wide presence theme variables
- gate
- prepare
- during shared
- minimal
- simple
- vivid
- sheets
- integrate
- responsive

Use the HTML prototype's palette direction:

- charcoal background
- amber primary
- sage gentle/support
- rose hard/help
- vivid mode colour field only

Reduce panel count. Prepare can use a few framed controls, but During should be mostly unframed. Avoid heavy segmented controls during the session.

## Implementation sequence

1. Add `PresenceLevel`, migration, and tests.
2. Move presence choice into Prepare with Minimal / Simple / Vivid.
3. Remove live Simple/Kaleidoscope switching from SafetyGate, ShellHeader, and During.
4. Simplify Prepare into primary sections plus a `More setup` disclosure.
5. Split During into the three presence renderers.
6. Update hard-state copy and anchor/help behavior.
7. Simplify Integrate and tuck History behind saved-session affordance.
8. Reorganize CSS and align the palette to the dark amber prototype.
9. Run mobile and desktop visual QA at 390, 768, and 1440 widths.
10. Build, test, catalog-check, then deploy through the normal Shippie path.

## Tests to add or update

- state migration maps old simple/kaleidoscope modes into the new presence level
- optional setup guidance updates when anchor/contact/safety fields change
- session starts with the chosen presence level snapshot
- During has no visible presence switcher once started
- Minimal mode renders no orb/canvas animation
- Simple mode renders the breathing orb
- Vivid mode renders the vivid field
- hard check-in opens Anchor
- Help call links use trusted contact and emergency number
- integration save keeps the session local

## First implementation slice

Start with the smallest vertical slice:

- Add `presenceLevel`
- Migrate old state
- Add the three-option Prepare picker
- Lock During to the chosen level
- Remove the visible live mode toggle
- Implement Minimal mode as text-only

That slice proves the main product decision without touching every safety/detail section at once.
