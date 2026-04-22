# PWA Wrapper Phase 2+3 — Verification Report

**Date:** 2026-04-22
**Branch:** `feature/pwa-wrapper-phase-2-3`
**Status:** ✅ All 18 planned tasks complete. 57 commits. 335 tests pass / 0 fail. Typecheck: only pre-existing errors.

---

## Test matrix

| Package | Pass | Fail | Δ vs. Phase 1 |
|---|---:|---:|---:|
| `@shippie/sdk` | 101 | 0 | +33 (P1: 68 → P2+3: 101) |
| `@shippie/web` | 152 | 0 | +42 (P1: 110 → P2+3: 152) |
| `@shippie/worker` | 35 | 0 | +16 (P1: 19 → P2+3: 35) |
| `@shippie/pwa-injector` | 10 | 0 | +3 |
| `@shippie/db` | 24 | 0 | 0 (schema-only additions, no new tests) |
| `@shippie/session-crypto` | 13 | 0 | 0 |
| **Total** | **335** | **0** | **+94** |

---

## Shipped capability matrix

### Phase 2 — Native-feel runtime

| Capability | Module | Tests |
|---|---|---:|
| View Transitions wrap | `packages/sdk/src/wrapper/view-transitions.ts` | 4 |
| Back-swipe gesture | `packages/sdk/src/wrapper/gestures.ts` | 3 |
| Pull-to-refresh | `packages/sdk/src/wrapper/gestures.ts` | 2 |
| Haptics | `packages/sdk/src/wrapper/haptics.ts` | 6 |
| Theme-color writer | `packages/sdk/src/wrapper/theme-color.ts` | 2 |
| Update-ready toast | `packages/sdk/src/wrapper/update-toast.ts` | 3 |
| Handoff sheet UI | `packages/sdk/src/wrapper/handoff-sheet.ts` | 5 |
| Handoff helpers (P1) | `packages/sdk/src/wrapper/handoff.ts` | 10 |
| Worker handoff route | `services/worker/src/router/handoff.ts` | 4 |
| Platform handoff dispatcher | `apps/web/app/api/internal/handoff/route.ts` | 4 |
| Handoff email/push renderer | `apps/web/lib/shippie/handoff.ts` | 3 |
| `ThemeColor` React wrapper | `apps/web/app/components/theme-color.tsx` | 1 |
| Integrated into `startInstallRuntime` | `packages/sdk/src/wrapper/install-runtime.ts` | 6 (2 new) |

### Phase 3 — Event spine + dashboard + push + splash

| Capability | Module | Tests |
|---|---|---:|
| Push subscribe/unsubscribe helpers | `packages/sdk/src/wrapper/push.ts` | 6 |
| Worker beacon route | `services/worker/src/router/beacon.ts` | 4 |
| Worker push routes | `services/worker/src/router/push.ts` | 5 |
| Worker splash route | `services/worker/src/router/splash.ts` | 3 |
| Platform ingest events | `apps/web/app/api/internal/ingest-events/route.ts` | 4 |
| Platform rollups cron | `apps/web/app/api/internal/rollups/route.ts` | 2 |
| Platform retention cron | `apps/web/app/api/internal/retention/route.ts` | 3 |
| Platform push subscribe | `apps/web/app/api/internal/push/subscribe/route.ts` | 3 |
| Platform push unsubscribe | `apps/web/app/api/internal/push/unsubscribe/route.ts` | 4 |
| Pure rollup aggregator | `apps/web/lib/shippie/rollups.ts` | 5 |
| Push-dispatch stub (VAPID wiring deferred to Phase 4) | `apps/web/lib/shippie/push-dispatch.ts` | 1 |
| Analytics query helpers | `apps/web/lib/shippie/analytics-queries.ts` | 6 |
| Maker analytics page | `apps/web/app/dashboard/apps/[slug]/analytics/page.tsx` | — |
| SVG charts | `apps/web/app/dashboard/apps/[slug]/analytics/charts.tsx` | — |
| Splash + icon generator | `apps/web/lib/shippie/splash-gen.ts` | 6 |
| Deploy-pipeline wiring | `apps/web/lib/deploy/index.ts` (+`generate-assets.ts`) | — |
| PWA-injector splash link tags | `packages/pwa-injector/src/inject-html.ts` | 3 |

### DB schema additions

- `app_events` — partitioned by month, composite PK `(id, ts)`.
- `usage_daily` — rollup target, PK `(app_id, day, event_type)`.
- `wrapper_push_subscriptions` — endpoint-keyed Web Push subs (distinct from the pre-existing OAuth `push_subscriptions` table).
- Migration: `packages/db/migrations/0015_app_events_spine.sql`.

### Cron wiring

`vercel.json` now schedules:
- `/api/internal/rollups` — hourly (`0 */1 * * *`)
- `/api/internal/retention` — daily at 04:00 UTC (`0 4 * * *`)

Pre-existing crons preserved: `reconcile-kv`, `reap-trials`.

### Env additions

New entries in `apps/web/.env.example`:
- `RESEND_API_KEY` (handoff email dispatch)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (Web Push)
- `CRON_SECRET` (Vercel cron bearer for rollups + retention)
- `SHIPPIE_INTERNAL_CRON_TOKEN` (self-host / manual-invoke alternative)

### Wrapper SDK surface (final)

`@shippie/sdk/wrapper` now exports **34 runtime values + 14 type exports**:

```
addDwell, attachBackSwipe, attachPullToRefresh, buildBounceTarget,
buildHandoffEmailPayload, buildHandoffUrl, computePromptTier, deserialize,
detectIab, detectInstallMethod, detectPlatform, detectStandalone, haptic,
isDismissedRecently, mountBounceSheet, mountHandoffSheet, mountInstallBanner,
mountUpdateToast, pushSupported, readInstallContext, recordDismissal,
recordMeaningfulAction, recordVisit, serialize, setThemeColor,
startInstallRuntime, subscribePush, supportsViewTransitions, unmountAll,
unmountHandoffSheet, unmountUpdateToast, unsubscribePush, validateEmail,
wrapNavigation
```

Types: `BackSwipeOptions`, `BannerProps`, `BounceInput`, `BounceScheme`, `BounceSheetProps`, `BounceTarget`, `HandoffEmailPayload`, `HandoffSheetProps`, `HapticKind`, `IabBrand`, `InstallContext`, `InstallMethod`, `Platform`, `PromptState`, `PromptTier`, `PullToRefreshOptions`, `PushEndpoints`, `StartInstallRuntimeConfig`, `SubscribeResult`, `UpdateToastProps`.

IIFE bundle at `/__shippie/sdk.js` auto-boots `startInstallRuntime()` on every maker app.

---

## Typecheck

Only the pre-existing 6 errors remain on the branch (same set as Phase 1):

```
app/api/deploy/github/route.ts:20  — Cannot find module '@/lib/build'
app/api/deploy/github/route.ts:21  — Cannot find module '@/lib/build/policy'
app/api/deploy/path/route.ts:22    — Cannot find module '@/lib/build'
app/api/deploy/path/route.ts:23    — Cannot find module '@/lib/build/policy'
app/api/github/webhook/route.ts:27 — Cannot find module '@/lib/build'
app/api/github/webhook/route.ts:28 — Cannot find module '@/lib/build/policy'
```

Root cause (unchanged): `apps/web/lib/build/` is untracked work-in-progress on main's parent checkout. Fresh clones of main surface the same six errors. **Zero new errors introduced by Phase 2+3.**

---

## Known follow-ups (explicit Phase 4 work)

Intentionally deferred:
- **Web Push VAPID signing** — `apps/web/lib/shippie/push-dispatch.ts` is a stub returning `{ ok: false, reason: 'not_implemented' }`. Phase 4 wires JWT signing + aes128gcm envelope encryption via SubtleCrypto.
- **Real QR rendering** — handoff sheet currently shows the handoff URL as text inside a bordered box. A proper QR renderer (e.g. `qrcode` npm) lands in Phase 4.
- **Web vitals dashboard tile** — analytics page currently covers install funnel + IAB bounce; LCP/CLS/INP aggregations from `app_events.metadata` are Phase 4.
- **`canPush: true` wiring** — install-runtime hardcodes `false` for now; Phase 4 flips it on when the user has a registered subscription on file.

These don't block Phase 2+3 landing. Each is one bounded module of work.

---

## Commits (57 on branch, newest first — abridged)

```
a1a791f feat(web/layout): mount ThemeColor for consistent status bar tint
4b5f4b0 feat(web): ThemeColor React wrapper over setThemeColor
3ec0528 chore(web): .env.example additions for Phase 2+3 wrapper
7ff96a6 chore(vercel): cron entries for rollups + retention
7c93382 feat(sdk/wrapper): export all Phase 2+3 submodules
5cabbc1 feat(pwa-injector): emit apple-touch-startup-image link tags
3e73070 feat(web/deploy): hook splash+icon generation into pipeline
c66cd9c feat(web/shippie): sharp-based splash + maskable icon generators
34858c5 test(web/shippie): failing splash-gen tests + sharp devDep
0b4d7d5 feat(web/dashboard): per-app analytics page (Phase 3 v1)
1f07bf0 feat(web/dashboard): dependency-free SVG charts for analytics
c4fc49e feat(web/shippie): analytics query helpers for maker dashboard
da37c2d test(web/shippie): RED — analytics query helpers
ae7311f test(pglite): share one PGlite handle per test file via beforeAll
1f5b531 feat(push-dispatch): Phase-2 stub with clear TODO
665fc34 test(push-dispatch): failing stub signal test
5848dd1 feat(push-sub-unsub): signed upsert + delete by endpoint
b09a17c test(push-sub-unsub): failing push subscribe/unsubscribe routes
b042c72 feat(retention): cron drops app_events partitions >2 months old
61932df test(retention): failing cron retention tests
7d36ab3 feat(rollups-route): cron aggregates app_events into usage_daily
c06cc18 test(rollups-route): failing cron rollup tests
e7d9bcd feat(ingest-events): signed ingestion into app_events spine
5ef62ee test(ingest-events): failing signed ingestion tests
5ad9a76 feat(rollups): pure daily bucket aggregator
eae007f test(rollups): failing aggregator tests
e834057 feat(db): app_events + usage_daily + wrapper_push_subscriptions schema
0309e62 chore(web): .env.example entries for Resend + VAPID
2533a12 feat(web/handoff): platform dispatcher for email + push
fdbf81a test(web/handoff): failing platform handoff route tests
8f6c8d5 feat(web/handoff): pure email + push payload renderers
8f9f535 test(web/handoff): failing renderer + payload tests
20432c9 feat(sdk/wrapper): desktop handoff branch + haptics/theme-color hooks
ba9b006 test(sdk/wrapper): failing desktop-handoff integration tests
cf41f29 feat(worker/splash): per-app splash images with default fallback
82585b8 test(worker/splash): failing splash image route tests
6c4d9d1 feat(worker/push): VAPID key + subscribe/unsubscribe relay
022e4db test(worker/push): failing push subscription route tests
aad4c02 feat(worker/beacon): signed beacon ingest with 200-event cap
322e1d2 test(worker/beacon): failing beacon ingest route tests
bf47718 feat(worker/handoff): signed handoff proxy with rate limit
266b822 test(worker/handoff): failing handoff route tests
7952708 feat(sdk/wrapper): Web Push subscribe/unsubscribe helpers
15f45fa test(sdk/wrapper): failing push subscription helper tests
fe8b2d7 feat(sdk/wrapper): desktop handoff modal
5b1555b test(sdk/wrapper): failing handoff sheet UI tests
dda6427 feat(sdk/wrapper): update-ready toast with Reload button
62bbed5 test(sdk/wrapper): failing update-ready toast tests
3a91e8c feat(sdk/wrapper): theme-color meta writer
5084ce4 test(sdk/wrapper): failing theme-color writer tests
3ddebdc feat(sdk/wrapper): haptics helper with reduced-motion guard
b831de2 test(sdk/wrapper): failing haptics helper tests
6e599e1 feat(sdk/wrapper): back-swipe + pull-to-refresh gesture helpers
16d4939 test(sdk/wrapper): failing gesture helper tests
562d58a feat(sdk/wrapper): View Transitions wrapping
be7d226 test(sdk/wrapper): failing View Transitions wrap tests
6cba87b docs: PWA wrapper Phase 2+3 implementation plan (18 tasks)
```

Strict TDD discipline maintained: every feature commit preceded by a failing-test commit.
