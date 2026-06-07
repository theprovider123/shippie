# Uniti Phase 0 — Design System (locked from Claude Design)

> **STRICT MANDATE:** Uniti's teacher-facing UI must match this design language exactly. Source of truth = the prototype in `docs/uniti-design-reference/` (`uniti-ui.jsx` components, `uniti-data.js` content/tone, `uniti-screens-{a,b}.jsx` screens, `Uniti School Cloud.html` entry). Do not invent new colours, fonts, or component styles. Uniti owns its identity (teal/marigold) — this is distinct from Shippie chrome by design (apps own their colour).

## Brand & identity
- Wordmark: lowercase **`uniti`** (bold) + "School Cloud" subtitle. Calm classroom cockpit, not corporate dashboard. Warm, fast, forgiving, low-reading, low-click, satisfying under pressure. **Never childish.**
- Login = split screen: teal brand panel (school identity + trust cues "Private school cloud · GDPR compliant · UK data · Works offline · Wonde MIS sync") + warm-white content (SSO-first: Google Workspace, Microsoft 365; magic link; **shared-device quick-pick teacher**; "Your data stays within your school's private cloud").

## Typography
- **Plus Jakarta Sans** (Google Fonts), weights 400/500/600/700/800 + italic 400. `font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;`
- Headings 700–800, tight letter-spacing (-0.01em). Body 400–500.

## Color tokens (CSS custom properties — use verbatim)
```css
:root{
  --bg:#F8F7F4; --surface:#FFFFFF; --border:#E8E6E3;
  --text:#1A1917; --text-muted:#6B6864; --text-subtle:#A39F9B;
  --primary:#1B9B7A; --primary-dark:#137A60; --primary-light:#E4F5F0;   /* teal */
  --accent:#E8953A; --accent-light:#FEF0DC;                              /* marigold */
  /* feedback states (the product's core verbs) */
  --got-it:#2EAD73;  --got-it-bg:#E8F6EF;
  --nearly:#E8953A;  --nearly-bg:#FEF0DC;
  --revisit:#D95A57; --revisit-bg:#FDECEB;
  --absent:#8B93A1;  --absent-bg:#F1F3F6;
  --sup-yes:#3A8FCC; --sup-yes-bg:#E3F2FB;   /* support worked */
  --sup-no:#8B6BD6;  --sup-no-bg:#F0ECFD;    /* support didn't */
  --radius-sm:8px; --radius:12px; --radius-lg:20px;
  --shadow:0 1px 3px rgba(0,0,0,0.05),0 2px 8px rgba(0,0,0,0.04);
  --shadow-md:0 4px 20px rgba(0,0,0,0.10);
  --shadow-lg:0 8px 40px rgba(0,0,0,0.15);
}
```
Group badges: SEND `#FEE2E2/#B91C1C` · EAL `#DBEAFE/#1D4ED8` · FSM `#FEF9C3/#854D0E`.

## The 6 feedback states (one-tap capture — the heart of the product)
`got_it` ✓ "Got it" · `nearly_there` ◑ "Nearly there" · `needs_revisit` ↩ "Needs revisit" · `absent` "Absent" · `support_worked` (blue) · `support_didnt` (purple). Each = pill (emoji + label, status colour bg). Pupil avatar = initials on a coloured disc with a **status-colour ring** when feedback is set.

## Component inventory (port from `uniti-ui.jsx` — match exactly)
- **Icon** — 24px stroke-2 round line icons (lucide-style set defined in the file).
- **Avatar** — initials, colour-by-name, optional `statusColor` outline ring.
- **GroupBadge** — SEND/EAL/FSM mini pills.
- **StatusPill** — feedback state (emoji + label).
- **ProgressRing** — SVG ring, animated stroke, centre label (used for class/pupil progress).
- **SyncChip** — synced (green ✓) / syncing (amber) / offline + pending count. Always-visible sync truth.
- Cards: `--surface`, `--radius`/`--radius-lg`, `--shadow`. Big tap targets, minimal typing, low cognitive load.

## The 8 screens (build to these — see `uniti-screens-{a,b}.jsx`)
1. School-branded login (above) · 2. Teacher **Today** (today's lessons, sync status, quick actions) · 3. **Class Map** (visual pupil grid) · 4. **Pupil feedback drawer** (one-tap states + optional voice/text note + support strategy + confidence) · 5. **Adaptation cards** ("What the class needs next" — editable) · 6. **Pupil progress timeline** (by objective) · 7. **Leadership** (progress / inclusion / vulnerable groups / adaptation impact) · 8. **School setup/admin** (MIS sync, staff roles, AI consent, privacy, branding).

## Adaptation card shape (from `uniti-data.js`) — the core object
`{ for/target, objective, need, strategy, teacher_action, why_this/basedOn, evidence, confidence, emoji, review_state, outcome }`. Teacher copy, never AI-essay: e.g. *"Pre-teach: numerator, denominator, equivalent — for Amira J., Leo D., Ravi S. · Worked last time · 81%."*

## "What Works" pupil memory (Phase 6) — teacher-owned language
recurringNeeds (freq + subjects + emerging/established), strategiesThatWork (successRate + count), standing adaptations. Language: "What helps", "Worked recently", "Emerging pattern", "Evidence from 3 lessons". **No deficit labels, no diagnosis, no automated decisions.**

## Subjects & the English breakout (USER INSTRUCTION 2026-06-07)
Subjects: Maths, **English**, Science, … On the **overview / leadership / progress** views, **English MUST break out into its three strands: Reading, Writing, SPaG** (spelling, punctuation & grammar). Model English as a parent subject with child strands `english.reading`, `english.writing`, `english.spag`; roll up to "English" for the headline but always allow drill-down to the three. Objectives attach at strand level.

## Tone
Friendly, calm, capable, school-aware: noise, interruptions, flaky Wi-Fi, tired staff, mixed-ability classes, evidencing progress without more workload. Magic moment: *"I understand my whole class in 30 seconds, capture feedback in 2 minutes, and get a useful next step without writing a report."* No dashboards-until-useful, no AI prompt boxes, no technical words.

## How this maps to the build
- Phase 0 (this) = the design lock. The eventual `apps/uniti-school` (Phase 3) renders these screens in SvelteKit using these tokens/components (port the React primitives to Svelte; keep names + styles identical).
- Phase 1A (cloudlet slice, in progress) is backend — it does not render teacher UI, but its `/uniti` office-manager flow must already use these tokens (Plus Jakarta Sans, teal/marigold, calm cards) so the design is consistent from day one.
- Self-host Plus Jakarta Sans woff2 in the app (don't depend on the Google CDN at runtime) per the Shippie self-hosted-fonts convention.
