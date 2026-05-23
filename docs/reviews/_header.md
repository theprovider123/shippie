# Shippie — full UI/UX & feature review (2026-05-23)

> Code-only review across the entire Shippie monorepo: 64 showcase apps + the platform container + the AI iframe. Every app gets 5+ concrete recommendations spanning **UI polish**, **UX flow**, **feature additions**, and **cleanup/tightening**. Flagships (chiwit, recipe, match-room, world-cup-fantasy) get a deeper pass.
>
> Method: 11 parallel review agents (Explore subagents) read package.json + App.tsx + styles.css + component tree + tests for each app. No builds were run.
> Reviewer mindset: judgey and concrete. "Improve spacing" doesn't count — citations are `file:line` where possible.

---

## How to read this

Per-app blocks follow a consistent shape:

```
### showcase-<slug>
**Stack:** key deps + kit-v2 usage
**Summary:** one line

**UI polish:** 2+ concrete bullets
**UX flow:** 2+ concrete bullets
**Feature additions:** 1+ bullet
**Cleanup / tightening:** 1+ bullet
```

Flagships also have **Current strengths** so you can see what *not* to break.

---

## Top-line findings (read first)

These are the patterns that recur across many apps. Fix at the platform/kit layer once instead of 60 times.

### CRITICAL — kit-skin gaps

The `@shippie/showcase-kit-v2` invariant: **the kit ships zero CSS**. Any app importing it must paint the `.shippie-onboarding`, `.shippie-intent-toast`, `.shippie-qr-sheet`, `.shippie-backup-card`, `.shippie-empty-state` skin block (~56 rules; reference is `apps/showcase-chiwit/src/styles.css`). Skipping the skin means the kit's components ship visibly broken.

| App | Imports kit? | Skin painted? | Action |
|---|---|---|---|
| chiwit | ✅ | ✅ full | reference |
| recipe (Palate) | ✅ | ✅ full | OK |
| match-room | ✅ | ✅ full | OK |
| world-cup-fantasy | ✅ | ✅ full | OK |
| parade-companion | ✅ | ✅ partial — `.shippie-qr-sheet` only | paint the other 4 |
| ledger | ✅ | ❌ none (consume-prompt only) | **CRITICAL — paint skin** |
| live-room | ✅ | ❌ `.shippie-empty-state` missing | **CRITICAL if EmptyState is rendered** |
| steep | ✅ | ❌ | safe today (custom DisclaimerSheet) — document or paint preemptively |
| story-studio | ✅ | ❌ | safe today — document or paint |
| symptom-diary | ✅ | ❌ | safe today — document or paint |
| tab | ✅ | ❌ | safe today — document or paint |
| therapy-notes | ✅ | ❌ | safe today — document or paint |

**Recommendation:** add a lint or test that grep-checks `package.json` for `@shippie/showcase-kit-v2` and the `styles.css` for `.shippie-onboarding` together. Fail the build on mismatch.

### Cross-cutting cleanup themes

1. **Fraunces @font-face duplication** — every showcase declares the same 4 Fraunces weights (italic 500, normal 500/600/700). Many never use italic or 500. Extract to a shared `packages/showcase-base/fonts.css` and `@import` it.
2. **Palette duplication** — sage `#4FA487`, coral `#E84A2D`, gold `#F4B860` appear inline in dozens of apps. Centralise in `@shippie/design-tokens` and migrate every app to CSS variables.
3. **Tab nav a11y** — almost no showcases set `role="tab"` / `role="tablist"` / `aria-current="page"`. Add a `<TabNav>` primitive to the kit and convert.
4. **localStorage error handling** — many empty catch blocks (stack, sudoku, tap-counter, color-of-day). Introduce a shared QuotaManager hook with logging + user-facing fallback.
5. **Safe-area insets** — multiple apps (drift, snake, site-visit, restaurant-memory, dough, drift, invaders) ignore `env(safe-area-inset-*)` for fixed elements. Add a `.safe-bottom`/`.safe-top` utility.
6. **`force(n => n + 1)` render hacks** — drift, crossing, maze, invaders, bricks all use this anti-pattern for canvas RAF loops. Replace with useReducer or pull the loop out of React's render cycle entirely.
7. **Missing IntentMatchers** — stack, sudoku, tap-counter ship none. Cross-app discovery suffers.
8. **Intent naming inconsistency** — `cooked-meal` vs `meal-planned` vs `leftover-available` vs `pitch-drafted` vs `dined-out`. Namespace under verbs (`meal.cooked`, `meal.planned`) and document the convention in each `IntentMatchers.ts` header.
9. **Keyboard support gap** — arcade games (block-drop, bricks, bulwark, chess, drift, crossing, maze, invaders, snake, stack) prioritise touch; add arrow-keys + space across the board.
10. **APP_SLUG copy-paste bug** — `showcase-dough/src/App.tsx:22` reads `APP_SLUG = 'drawing-telephone'`. Priority fix.
11. **Match Room → WCF emission** — outstanding from CURRENT_STATE.md. Wire HostMatchday to emit `kickoff-soon` ~10 min before OPENING_FIXTURE.kickoff so WCF's forward-compat matcher activates.

### Platform & AI iframe headline items

- **Platform — modal queue stacking bug.** IntentPromptModal and TransferPromptModal both render flat without a unified queue. Add a dispatched `PendingPrompt` union with a single modal slot. Also unlocks "1 of N" queue indicators.
- **Platform — gesture tuning constants belong in their own file.** AppSwitcherGesture hardcodes spring values inline; `/dev/gesture-prototype` should pull from `lib/container/app-switcher-gesture.ts`.
- **AI iframe — boot readiness signalling.** Add `shippie.ai.ready(): Promise<void>` so showcases can gate AI-dependent UI on the first `ReadyMessage` instead of issuing requests during Worker boot.
- **AI iframe — collapse `unavailable` to `downloading | unavailable`.** Showcases hide AI features forever today on a transient model download.

---

