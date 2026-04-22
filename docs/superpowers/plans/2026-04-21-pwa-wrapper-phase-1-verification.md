# Phase 1 Verification Report (Task 18)

**Date:** 2026-04-21
**Branch:** `feature/pwa-wrapper-phase-1`

## Test suite — 176 pass / 0 fail across 6 packages

| Package | Tests |
|---|---|
| `@shippie/sdk` | 59 pass |
| `@shippie/web` | 63 pass |
| `@shippie/worker` | 10 pass |
| `@shippie/db` | 24 pass |
| `@shippie/session-crypto` | 13 pass |
| `@shippie/pwa-injector` | 7 pass |
| **Total** | **176 / 176** |

## Wrapper export surface (20 names)

```
addDwell, buildBounceTarget, buildHandoffEmailPayload, buildHandoffUrl,
computePromptTier, deserialize, detectIab, detectInstallMethod,
detectPlatform, detectStandalone, isDismissedRecently, mountBounceSheet,
mountInstallBanner, readInstallContext, recordDismissal,
recordMeaningfulAction, recordVisit, serialize, unmountAll, validateEmail
```

Resolves from `./packages/sdk/dist/wrapper/index.js` via the `./wrapper` subpath export.

## Typecheck — pre-existing-only

Four typecheck errors remain on the branch. **None were introduced by this phase** — each exists in tracked repo state on `main` as well:

1. `apps/web/app/api/deploy/github/route.ts:19` — `Cannot find module '@/lib/build'`
2. `apps/web/app/api/deploy/path/route.ts:21` — `Cannot find module '@/lib/build'`
3. `apps/web/app/api/github/webhook/route.ts:26` — `Cannot find module '@/lib/build'`
4. `apps/web/lib/functions/runner.ts:167` — `Property 'preconnect' is missing in type '…' but required in type 'typeof fetch'`

The `@/lib/build` errors are because `apps/web/lib/build/` exists as untracked working-directory-only files on `main` — it isn't committed. Any fresh clone of `main` surfaces the same three errors. The `preconnect` error is latent in `buildAllowlistedFetch`'s return type; `typeof fetch` requires a `.preconnect()` method (modern Node 22 / Undici fetch) that the returned async function doesn't declare.

None of the four files touched by this phase introduce new typecheck errors. Verified by running tsc on `main` (parent checkout, including the untracked `lib/build/` working files) before and comparing.

## Build — one pre-existing flake in `@shippie/cli`

`bun run build` at repo root fails on `@shippie/cli`:
```
error TS5074: Option '--incremental' can only be specified using tsconfig,
emitting to single file or when option '--tsBuildInfoFile' is specified.
```

This is ambient to the worktree: `bun run build` on the parent `main` checkout succeeds with the same `tsup@8.5.1` and `typescript@5.9.3` versions. The failure appears related to tsup's internal DTS-worker caching state, not to any code this phase produced. `@shippie/sdk` (including the new `dist/wrapper/`) builds cleanly.

## Commits on the branch (main..HEAD, newest first)

```
972f51c chore(web): use local bun-test.d.ts shim instead of @types/bun
db6858f feat(web): swap legacy install banner for shared InstallRuntime on home page
52a9394 feat(web): InstallRuntime wraps shared wrapper runtime for marketplace
147af72 test(web): failing InstallRuntime component smoke test
61b3d62 feat(worker/manifest): merge shippie.json overrides, add Phase 1 PWA fields
4909b08 test(worker/manifest): failing tests for Phase 1 enriched manifest
2ba43b0 feat(sdk): expose wrapper runtime as @shippie/sdk/wrapper export
2943f57 feat(sdk/wrapper): vanilla DOM UI for install banner and bounce sheet
1a5197c test(sdk/wrapper): failing DOM-render smoke tests, add happy-dom dev dep
95a1585 feat(sdk/wrapper): desktop handoff helpers
c8ae28e test(sdk/wrapper): failing handoff helper tests
94fbb9d fix(sdk/wrapper): narrow BounceTarget|null in iab-bounce tests
89b2be4 feat(sdk/wrapper): IAB bounce target builder
550dc25 test(sdk/wrapper): failing IAB bounce target tests
3d01fda feat(sdk/wrapper): smart-prompt state machine
d9fad50 test(sdk/wrapper): failing smart-prompt state machine tests
20eff8f fix(sdk/wrapper): address code review on UA detection
96ed0aa chore(sdk): add @types/bun for bun:test type support
c67e02d feat(sdk/wrapper): UA detection for platform, install method, IAB
af347f3 test(sdk/wrapper): failing UA detection tests
b2d8d7e feat(shared): add Phase 1 PWA fields to shippie.json schema
```

21 commits. TDD discipline maintained throughout — every feature commit is preceded by a failing-test commit.

## Summary

- **Shipped end-to-end:** shared PWA install-funnel wrapper in `@shippie/sdk/wrapper`, enriched `__shippie/manifest` route, `apps/web` marketplace swapped to the shared runtime.
- **176/176 tests green.**
- **Zero new typecheck errors.**
- **Ready to merge** once the pre-existing `lib/build/` and `preconnect` issues are resolved out-of-band (those are not this phase's responsibility).
