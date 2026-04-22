# PWA Wrapper Phase 5 (Marketplace Growth) — Verification Report

**Date:** 2026-04-22
**Branch:** `feature/pwa-marketplace-growth`
**Status:** ✅ All 7 tasks complete. 418 tests pass / 0 fail across 6 packages.

---

## Test matrix

| Package | Pass | Δ vs. Phase 4 |
|---|---:|---:|
| `@shippie/sdk` | 133 | +15 (referral helpers + install-runtime ref attachment) |
| `@shippie/web` | 203 | +32 (ratings, co-installs, leaderboards, install-click, widget integration) |
| `@shippie/worker` | 35 | 0 |
| `@shippie/pwa-injector` | 10 | 0 |
| `@shippie/db` | 24 | 0 |
| `@shippie/session-crypto` | 13 | 0 |
| **Total** | **418** | **+47** |

---

## Shipped capability matrix

### Ratings + reviews
- Schema: `app_ratings` (composite PK `(app_id, user_id)`, CHECK rating ∈ [1,5], review text up to 2000 chars, created/updated timestamps). Migration `0016`.
- Queries: `queryRatingSummary`, `queryLatestReviews`, `queryUserRating`, `upsertRating` in `apps/web/lib/shippie/ratings.ts`.
- Route: `POST /api/apps/[slug]/rate` with session auth, JSON body validation, 2000-char review cap.
- UI: `<RatingsSummary>` presentational + `<RateWidget>` client component. Mounted on app detail page (signed-in users only for rate widget) + maker dashboard analytics.

### Co-install graph
- Schema: `user_touch_graph` with canonical `(app_a < app_b)` pair ordering, CHECK constraint enforced. Migration `0017`.
- Rollup: extended `/api/internal/rollups` to derive distinct (user, app) pairs from `app_events` within the rolled-up window, then upsert pair counts. TODO: per-pair dedup across windows (Phase 6).
- Queries: `queryCoInstalls` orders shared-user pairs desc.
- UI: `<CoInstallWidget>` shelf on app detail — "Users also installed" — hydrates slug list into full cards filtered to public + live apps.

### Leaderboards
- Route: `/leaderboards` public server-rendered page.
- Shelves: Trending (last-7-day installs), New (last-14-day apps), Top-rated (avg rating, min 3 ratings).
- Queries: `queryTrending`, `queryNew`, `queryTopRated` with visibility filter (public + not archived + has active deploy).
- UI: `<AppCard>` reusable card matching the detail-page `taglineOrDesc` shape.

### Install attribution
- Wrapper-side: `captureReferral`, `readStoredReferral`, `clearReferral`, `buildInviteLink` in `packages/sdk/src/wrapper/referral.ts`. Stashes `?ref=…` in localStorage under `shippie-referral-source` with 7-day TTL, max 64-char source.
- Integration: `startInstallRuntime` reads the ref on load and attaches `ref` to every install-funnel beacon payload. Clears on successful install-accepted.
- Marketplace-side: `InstallButton` emits `POST /api/shippie/install-click` with `{ slug, source }` before the install flow. New route writes an `install_click` event into `app_events` with `metadata.source`.
- Wrapper SDK re-exports: `captureReferral`, `readStoredReferral`, `clearReferral`, `buildInviteLink` + types.

---

## Commits (24 on branch, newest first)

```
7b454f2 feat(web/apps): 'Users also installed' shelf on app detail page
01906e7 feat(web/apps): install-button emits install_click beacon with ?ref= source
6797d76 feat(web/shippie): install-click beacon writes events to app_events
e4ae60e test(web/shippie): failing tests for install-click beacon route
37388a4 feat(sdk/wrapper): export referral helpers from wrapper entrypoint
bd3a2b4 feat(sdk/wrapper): attach referral source to install-funnel beacons
56a6f74 feat(sdk/wrapper): referral capture + invite link helpers
6f33abd test(sdk/wrapper): failing tests for referral capture + invite helpers
7618064 feat(web/leaderboards): /leaderboards page with trending/new/top-rated shelves
8e6c612 feat(web/leaderboards): trending/new/top-rated query helpers
e9798db test(web/leaderboards): failing tests for trending/new/top-rated query helpers
dfaeb8e feat(web/shippie): queryCoInstalls ranked by user-touch-graph
0218ec4 test(web/shippie): failing co-install ranking tests
2a3adc7 feat(web/rollups): populate user_touch_graph from app_events
1e4d5cb feat(db): user_touch_graph for co-install pair counts
2ad6710 feat(web/apps): ratings section on app detail + analytics dashboard
66bde51 feat(web): RatingsSummary presentational component + RateWidget client
df1a77b feat(web/apps): POST /api/apps/[slug]/rate route
91a0a24 feat(web/shippie): rating summary + latest reviews + upsert helpers
fed23fe test(web/shippie): failing ratings query + upsert tests
52e9473 feat(db): app_ratings table for marketplace ratings + reviews
```

TDD preserved throughout.

---

## Typecheck

Only the same 6 pre-existing `@/lib/build` / `@/lib/build/policy` errors from main's untracked WIP. Zero new errors.

---

## Phase 6 candidates

- **Referral attribution in rollup**: `install_click` events carry `source`, but the rollup doesn't yet roll `source` into a per-source table. Add when product wants to cut "referrals by source" charts.
- **Per-pair dedup in user_touch_graph**: currently increments `users` column every rollup cycle. Fix: track (user, a, b) triples that have been counted to prevent double-counting across windows.
- **Rating moderation + spam**: no abuse controls on the rate endpoint beyond session auth. Consider per-user-per-app rate limiting (but the primary key already enforces 1 review per user).
- **Leaderboards caching**: page currently re-queries on every request. Add `cacheLife: '1 hour'` via Next.js caching primitives once there's traffic.
- **Invite-link flow**: `buildInviteLink` helper exists but no UI calls it yet. Phase 6 can add a "Share this app" flow in the wrapper or marketplace.

---

## Summary

Phase 5 closes the marketplace-growth loops from the original spec roadmap: every install now carries attribution, every app exposes ratings + reviews, co-installs feed cross-app recommendations, and a public leaderboards page surfaces the discovery signals. The wrapper SDK grew by 4 exports (all referral-related) and the event spine gained `install_click` + the `user_touch_graph` rollup. All deliverables test-green end-to-end.
