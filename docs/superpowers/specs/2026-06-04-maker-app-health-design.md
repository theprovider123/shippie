# Maker "App Health" View — Design Spec (Slice A)

**Goal:** Replace the overloaded per-app maker surface (5 visible tabs, an 11-block Overview) with one calm **Home** that answers *is it live · how many opens · what are people saying · what to fix*, plus three clearly-named tabs. Mobile-first; the global Dock/Tools/Maker/You nav is the consistent "route out."

**Context:** Continues the maker-backend cleanup (branch `review-implementation-2026-05-23`, commits `2e49ed41`..`40b70d33`). This is **Slice A** of a four-part holistic vision; B (user feedback affordance), C (two-way loop), D (Your Data + nav spine) are separate specs that build on A.

**Tech:** SvelteKit (apps/platform) · Cloudflare Workers · D1/drizzle · vitest · existing maker shell + `maker-labels-check` guard.

**Status:** Design approved with reviewer findings folded in (see §9). Awaiting spec review → writing-plans.

---

## 1. Decisions (locked)

- **Route strategy: re-tab + compose, preserve deep routes.** No URL migration; deep links keep working. The health view becomes the default at `…/[slug]`.
- **Tab set (4):** **Home · Feedback · Share & Access · Settings** (today: Overview · Feedback · Access · Profile · Proof).
- **Profile/listing merges into Share & Access** — *including* source repo, license, and remix terms (`appLineage`), because they're user-facing trust/share signals the launch checklist depends on. Settings stays for configuration only.
- **Usage depth: light + a simple 30-day opens sparkline.**
- **Metric truth: live-computed, never the stale denormalized columns** (see §5).

## 2. Tab → route map

| Tab | Route | Composed from | Owns server actions |
|---|---|---|---|
| **Home** | `…/[slug]` (today's Overview) | health view (§3); *summaries* of analytics + proof + feedback | none (read-only) |
| **Feedback** | `…/[slug]/feedback` (unchanged) | inbox | `setStatus` (existing) |
| **Share & Access** | `…/[slug]/access` (absorbs `profile`) | Share · Visibility · Invites/spaces · Public listing (name/tagline/category/icon/cover/links) · Source/license/remix | union of access (`archiveSpace` + invite actions) **and** profile (`save` + icon ingestion) |
| **Settings** | `…/[slug]/settings` (**new**) | SDK setup · Deploys history · App Kind · PWA readiness · Enhancements · Advanced | Kind `disputeKind`/`clearDispute`/`saveWorkflowProbes` (**moved off the Home/root server**) |

**Kept as drill-downs (off the tab bar, deep links preserved):** `analytics`, `proof`, `deploys/[deployId]`, `enhancements`, `localize`, `remix`.

**Active-tab + back-trail (P3):**
- `analytics`, `proof`, `deploys/*` highlight **Home**; each shows a `← Home` back trail.
- `enhancements` (and any Kind/PWA detail) highlight **Settings**; show `← Settings`.
- The tab `active` logic in `…/[slug]/+layout.svelte` keys off path prefixes accordingly.

## 3. Home — the calm health view

Single column. Each section follows the **empty-state rule (P2):** *expected-but-empty → compact prompt; genuinely N/A → hide.*

1. **Title row** (already built in the layout): icon · name · status pill · **Open** · **Share** (visibility-aware matrix).
2. **Metric strip:** `opens · saved · feedback · events` + a **30-day opens sparkline** to the right. (Sources in §5.)
3. **What people say:** top 3 feedback items (`status='open'`, ordered `voteCount desc`) with title + vote count; header shows `[N open] →` linking to Feedback. *Empty (new app):* compact prompt — "No feedback yet — add the feedback widget" + link to Settings → SDK setup. *(This block is where Slice B's user-submitted feedback will surface.)*
4. **Usage:** total events · last event name/time · the sparkline; `View details →` → existing `analytics` page. *Empty:* compact "No events yet — open your live app once after adding the SDK."
5. **Proof:** compact badge strip (e.g. `◆◆◇ 2 of 3`) → `proof` page. *N/A (no profile/badges):* hide.
6. **To fix:** only the **incomplete** launch-checklist items (live · feedback wired · analytics event · source+remix published · GitHub connected). Hides entirely when all done. Links now point at the new tabs (source+remix → Share & Access).

**Removed from Home** (moved, not deleted): the two SDK snippet cards → Settings; Connection/Kind status, PWA readiness, workflow probes, Deploys list → Settings; Visibility card → Share & Access.

## 4. Share & Access / Settings page composition

**Share & Access** (`…/[slug]/access` page, sectioned):
- **Share** — the visibility-aware matrix + QR (reuse `shareStateFor` + `MakerShareSheet`).
- **Visibility** — `VisibilityPicker` (existing).
- **Invites & spaces** — existing access content (`CreateInviteForm`, `InviteRow`, `PrivateSpaceShareComposer`, `archiveSpace`).
- **Public listing** — the profile form (name/tagline/category/icon/cover/links) **and** source repo/license/remix terms (`appLineage`). Moves the `save` action + **icon ingestion** from the profile server into this page's server.

**Settings** (`…/[slug]/settings`, **new** page + server, sectioned):
- **SDK setup** — feedback + analytics snippets (moved off Home).
- **Deploys** — last-N deploy list (moved off Home); rows link to `deploys/[deployId]`.
- **App Kind** — detected/declared/conflict + `disputeKind`/`clearDispute` forms + `saveWorkflowProbes` (actions **moved** here from the root `…/[slug]/+page.server.ts`).
- **PWA readiness** — checklist + upgrade snippet (moved off Home).
- **Enhancements** — link/section to the existing `enhancements` page.
- **Advanced** — placeholder for future mechanics.

## 5. Data layer — metric sourcing (P1)

The denormalized `apps` counters are unreliable: `installCount` and `feedbackOpenCount` have **no writers**; only `upvoteCount` is maintained (the upvote route increments it). Therefore Home computes live:

| Home metric | Source | Query |
|---|---|---|
| **opens** | raw analytics | `count(analyticsEvents)` where `appId` AND `eventName IN OPEN_EVENTS` |
| **opens sparkline** | raw analytics | group by `date(createdAt)` over last 30d, same filter; zero-fill missing days client-side |
| **saved** | `apps.upvoteCount` | maintained ✓ — read directly |
| **feedback (open)** | live | `count(feedbackItems)` where `appId` AND `status='open'` |
| **events (total)** | live | `count(analyticsEvents)` where `appId` |
| **top feedback** | live | `feedbackItems` where `appId` AND `status='open'`, `order voteCount desc limit 3` |

```
const OPEN_EVENTS = ['app_open', 'opened'];  // Dock 'app_open' + SDK 'opened';
                                             // excludes keyboard_open_in_tool, install*
```

**Explicitly out of scope for Slice A:** maintaining/backfilling `installCount`/`feedbackOpenCount`, and reconciling the `usage_daily` rollup vs. the leaderboard's `usage_daily.app_id = apps.slug` join bug. The sparkline reads **raw `analyticsEvents`** (covered by `analytics_events_app_created_idx`), not `usage_daily`, to avoid coupling to that inconsistency. (Future optimization: once `usage_daily` consistency is fixed, the sparkline can read the rollup.)

## 6. Server-action migration (P2)

Moving markup between pages moves the form **actions** too:
- The root `…/[slug]/+page.server.ts` currently hosts `disputeKind`/`clearDispute`/`saveWorkflowProbes`. These **move** to `…/[slug]/settings/+page.server.ts`; their forms post there.
- `…/[slug]/access/+page.server.ts` gains the profile `save` + icon-ingestion logic (merged from `profile/+page.server.ts`). Where a form must post to a sibling route, use an explicit `action="/maker/apps/[slug]/...?/name"` target rather than relying on the local default.
- The old `profile` route becomes a **308 redirect to `access`** (consistent with the preserve-deep-routes principle) so existing `…/profile` links/bookmarks don't 404.

## 7. Out of scope (separate slices)

- **B** — user-facing feedback icon in the Switcher share-card / kit primitive.
- **C** — maker↔user reply, status-back-to-user, public roadmap/voting.
- **D** — "Your Data" simplified interface + carrying Dock/You/Tools across more screens.

## 8. Testing

- **Unit (vitest):** the opens-per-day group query shape; the top-feedback filter (`open` only, vote-ordered); the empty-vs-N/A section logic (pure helper); merged Share & Access actions still save (profile fields + lineage) and `archiveSpace` still works; moved Kind actions resolve on the settings server.
- **Guard:** extend `maker-labels-check.mjs` to also fail on stale-counter reads (`installCount`/`feedbackOpenCount`) in the maker Home, so the P1 decision can't silently regress.
- **Manual:** 390/768/1440 pass across the 4 tabs; a new (zero-data) app shows compact prompts, a mature app shows a clean Home with no "to fix"; deep links to `…/profile`, `…/analytics`, `…/proof` still resolve.

## 9. Reviewer findings — resolution log

- **P1 (metric source):** resolved in §5 — live-computed metrics, `upvoteCount` only for saved, never the unmaintained columns. Verified at HEAD (`installCount`/`feedbackOpenCount` have no writers).
- **P1 (canonical open):** resolved in §5 — `OPEN_EVENTS = ['app_open','opened']`, raw analytics, no `usage_daily` dependency.
- **P2 (settings actions):** resolved in §6 — actions move with markup; explicit action targets.
- **P2 (empty states):** resolved in §3 — compact prompts for new apps; only N/A hides.
- **P2 (feedback preview filter):** resolved in §3/§5 — `status='open'`, vote-ordered.
- **P3 (tab count + active-tab):** resolved in §2 — 5 current tabs corrected; drill-down highlighting + back-trail defined.
