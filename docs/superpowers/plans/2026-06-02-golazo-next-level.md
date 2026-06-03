# Golazo → flagship: review + plan to ship (2026-06-02)

Review grounded in the code at HEAD (`apps/showcase-golazo`, ~6,600 lines, React 18,
offline/no-login, link-based sharing). Three deep reviews (UX flow, sweepstakes/pools,
design/responsiveness) + spot-verification.

## Verdict

Golazo is **visually flagship on mobile** — distinctive electric-green/stadium-night
design system, premium motion, real haptics, a genuinely strong canvas share card, and
a polished onboarding → group-rank → bracket flow. Two things stop it being ship-ready
at flagship tier, and they're exactly what the brief calls out:

1. **It has no web/desktop form.** Zero responsive breakpoints; portrait-locked; full-bleed
   on wide screens; a 100vw bottom nav. It *works* on desktop but looks like a stretched
   phone. For a `public-flagship` tier app billed as mobile **and** web, this is the #1 gap.
2. **The "sweepstake" isn't one.** It's a 48-team fantasy-draft draw with no pot, no winner,
   no results integration, and a seed that's shown but can't be imported (so it isn't even a
   shared draw). The single most culturally-expected World Cup social ritual is half-built.

Everything else is polish on a strong base.

## The three pillars of the plan

### Pillar 1 — Make the sweepstake the social spine (the "must")
Rebuild around the **classic office sweepstake**, because that's what goes viral in
workplaces and friend groups:

- **Draw model:** one team per person (when players ≤ teams in scope), random seeded draw.
  Scope selectable: all 48, a single group, or the 16-team knockout. Falls back to the
  current round-robin distribution only when there are fewer players than a fair single-team
  draw allows — so the existing `drawSweep` becomes the "more players than teams" branch, not
  the default.
- **Pot / buy-in:** a simple per-player stake number (no real money — a tracker). Shows the
  total pot and "winner takes £X."
- **Shared draw (no backend):** encode the whole draw in a link (`#sweep=…` via the existing
  `codec`), so the organiser draws once and everyone opens the *same* allocation — fixes the
  "seed is shown but useless" gap while staying offline/no-login. (The live-results feed can
  ride the existing golazo-feed Worker; the *allocation* needs no server.)
- **Live standings:** rank players by how far their drawn team has progressed, computed from
  the results feed that already drives pool scoring. Turns a one-time draw into a daily
  check-in ("is my team still alive?"). This is the retention hook.
- **Settle:** a winner screen when the tournament resolves — "🇧🇷 Brazil won — Sam takes the
  £80 pot," with a share card.
- **Per-player draw share card:** "I drew 🇧🇷 Brazil" card, mirroring the (already premium)
  bracket card. The viral artifact for the draw.

This subsumes the redundant/awkward bits (seed-with-no-import, "48 nations" copy that shows 4,
sweepstake button buried in pool detail) into one coherent feature.

### Pillar 2 — True mobile **and** web (responsive parity)
- **Cheap, huge win first:** wrap `.app/.screen` in a centered `max-width` "phone column"
  (~480–520px) so desktop stops stretching. Removes the "stretched phone" problem in one
  change.
- **Progressive enhancement where width actually helps:**
  - **Bracket** (`BracketView`) — the one screen that *wants* width: render the full knockout
    tree horizontally on ≥900px instead of round-by-round chips.
  - **Groups** — 2-up grid of group cards on ≥720px.
  - **Pools / sweepstake standings** — 2-col leaderboard on wide screens.
- **Desktop nav:** move the 100vw bottom bar to a compact centered rail (or left rail) above a
  breakpoint.
- **Landscape + orientation:** drop the hard portrait lock for web; support landscape on tablet.
- Add `@media` breakpoints (currently only `prefers-reduced-motion` exists).

### Pillar 3 — Polish + completeness pass (ship-blockers the reviews found)
High-impact, low-effort:
- **Top-scorer pick UI** — the data model has `topScorer` but there's no way to set it.
- **Results integration / full fixtures** — Live hardcodes 12 group fixtures; standings need
  the full schedule + results feed wired through (also unblocks sweepstake standings).
- **Empty/error states** — news ticker null-collapse, feed-fetch failure, realtime-bus failure,
  pool join errors.
- **Sharing friction** — click-to-copy pool codes; bracket preview in the incoming-share modal
  before committing; champion-aware (not generic-green) share card when no champion yet.
- **Motion restraint** — too many infinite loops (sheen + hero pulse + blink fighting); make
  the CTA sheen trigger-based, pause entrance staggers after first paint.
- **Haptic differentiation** — every tap is 8ms; distinguish toggle / confirm / celebrate.
- **Onboarding** — teach that the team grid is optional; tighten the long grid.

## Sequencing
1. **Pillar 2 baseline** (centered column + breakpoints + bracket-on-web) — fastest visible
   "it's a web app now" win, low risk.
2. **Pillar 1 sweepstake rebuild** — the centerpiece; biggest product value.
3. **Pillar 3 polish** — fold in alongside, ship-blockers first.

Throughout: it stays offline/no-login/link-shared. Verify on a fresh visit (clear storage)
on both a phone and a wide desktop viewport before calling any of it done.

## Open product decisions (need a call before building Pillar 1)
- **Sweepstake model:** classic one-team-each + pot (recommended) vs. keep multi-team draft vs.
  offer both modes.
- **Scope default:** all 48 nations, or knockout-16 (tighter, higher-stakes), per draw.
- **Web strategy depth:** centered-column-only (cheap, safe) vs. full progressive multi-column
  + wide bracket (more work, true flagship).
