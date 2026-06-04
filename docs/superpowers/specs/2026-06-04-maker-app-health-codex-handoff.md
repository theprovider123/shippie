# Codex Handoff — Maker "App Health" view (Slice A)

**You own this slice end-to-end.** Plan it, build it, health-gate it, commit it. Don't split it with another agent.

## What to build
Implement the design spec exactly: **`docs/superpowers/specs/2026-06-04-maker-app-health-design.md`**. Read it fully first — it has a resolution log (§9) capturing two rounds of review that already settled the hard questions. This handoff is just the surrounding context + guardrails.

## Foundation you're building on (already landed, branch `review-implementation-2026-05-23`, commits `2e49ed41`..`40b70d33`)
The maker backend was just rebuilt; reuse it, don't re-derive it:
- Real maker pages live at `apps/platform/src/routes/maker/**`. `/dashboard/*` is a **308 alias** — don't reintroduce `/dashboard` URLs.
- Per-app surface: `routes/maker/apps/[slug]/+layout.svelte` (title row with status pill + Open + **Share already wired**) + the 5 current tabs (Overview/Feedback/Access/Profile/Proof). Slice A re-tabs these to **Home · Feedback · Share & Access · Settings**.
- **Share is done:** `src/lib/maker/share.ts` (`shareStateFor`, pure + tested) + `src/lib/components/maker/MakerShareSheet.svelte` (Svelte; the kit's `QrShareSheet` is React-only — don't try to use it here). Reuse these in the Share & Access tab.
- Apps list (`routes/maker/apps/+page.{server,svelte}`) already does server-side search/filter/sort/pagination with the human status-pill mapping — mirror that pill style on Home.
- Layout load is slim (`routes/maker/+layout.server.ts` — recents + counts only). Keep it slim; Home owns its own queries.

## Hard guardrails (these are the review findings — do not regress them)
1. **Metric truth = live-computed.** `installCount` and `feedbackOpenCount` on the `apps` row have **no writers** (verified) — never read them for Home. Compute: opens from raw `analyticsEvents` (`eventName IN ('app_open','opened')`), feedback from `count(feedbackItems where status='open')`, events from `count(analyticsEvents)`. **"Favorites" = `apps.upvoteCount`** (the one maintained counter) — label it "favorites," not "saved" (Save-to-Dock is local-only, no server telemetry).
2. **Do NOT touch `usage_daily` / the leaderboard.** The rollup inserts by `appId` but the leaderboard joins `usage_daily.app_id = apps.slug` (a pre-existing bug). The sparkline reads **raw `analyticsEvents` grouped by day** (covered by `analytics_events_app_created_idx`). Reconciling the rollup is explicitly out of scope.
3. **Invites stay API-based.** Invite create/revoke go through `/api/…` fetches in `CreateInviteForm`/`InviteRow` — preserve those, don't convert to page actions. Only `archiveSpace` + the profile `save`/icon-ingestion migrate into the Share & Access page server.
4. **Server actions move with markup.** Kind `disputeKind`/`clearDispute`/`saveWorkflowProbes` currently live on the root `[slug]/+page.server.ts` → move to `settings/+page.server.ts`. Keep a temporary `?/save` compat action on `/profile` behind its GET 308 redirect.
5. **Feedback preview:** `status='open'` only, order `voteCount desc, createdAt desc, id desc`, render `title ?? excerpt(body) ?? type`.
6. **Empty states:** new (zero-data) apps get *compact prompts* for feedback/analytics — don't blank-hide everything; only genuinely-N/A sections hide.

## Workflow / repo conventions (from CLAUDE.md)
- Green-light is **`bun run health`** (typecheck + test + build). Run it before claiming done. Beware the pipe-exit gotcha — capture to a file and grep for failure markers, don't trust `| tail`'s exit code.
- `apps/platform` uses **vitest only** — never add `bun:test` imports there.
- The build now runs **`scripts/maker-labels-check.mjs`** (fails on "All apps"/"Your apps" or `/dashboard` URLs in the maker surface). The spec asks you to extend it to also fail on `installCount`/`feedbackOpenCount` reads in Home — do that so guardrail #1 can't silently regress.
- **Commits to `main` need explicit user authorization.** Work on `review-implementation-2026-05-23`. Stage files **explicitly** — this branch has concurrent work from other sessions (e.g. a `docs(games)` commit), so don't `git add -A` blindly.
- Plan-from-HEAD: verify any code claim against the actual file before relying on it.

## Out of scope (later slices — don't build these here)
- **B:** user-facing feedback icon in the Dock Switcher `.focused-share-card` (+ optional kit primitive).
- **C:** maker↔user reply / status-back / public roadmap+voting.
- **D:** "Your Data" simplified interface + carrying Dock/You/Tools across more screens.

## Suggested commit shape
Small, health-green commits per coherent step (e.g. Settings page + action move → Share&Access merge + profile compat → Home compose + live metrics + sparkline → empty states + guard extension + tests). Keep deep links (`…/profile`, `…/analytics`, `…/proof`) resolving throughout.
