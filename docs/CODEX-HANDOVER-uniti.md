# Codex Handover — Uniti on Shippie Private Cloud

**Date:** 2026-06-07 · **Branch:** `feat/uniti-cloudlet-phase-1a` (pushed, off `origin/main`, 52 commits) · **Author:** Claude

## STATUS: all build phases (1A–9) DONE + QA'd. Only the prod deploy + external switch-ons remain.

The whole product is built, tested green (except one pre-existing unrelated failure, §C), and screenshot-reviewed against the Claude Design prototype (match-or-improve). Plans: `docs/superpowers/plans/2026-06-07-uniti-*`. Design lock: `…-phase-0-design-system.md` + `docs/uniti-design-reference/`. QA screenshots: `docs/uniti-qa-screens/{desktop,mobile}/` (13 each) + `prototype/`.

### What's built
- **Phase 1A — cloudlet slice:** `@shippie/cloudlet-contract`, `private_app_instances` control-plane table, `SchoolWorkspace` DO+SQLite, `createPrivateAppInstance` (+ real Shippie `apps`(private)+`spaces`/`space_apps` install record), scoped event API + boundary guard.
- **Phase 2 — auth/RBAC:** `cloudlet_memberships`/`cloudlet_invites`, RBAC (8 roles, contract `ROLE_SCOPES` + server `authContextFor`), InviteSystem, Google+Microsoft SSO (Lucia+Arctic, env-gated) + magic-link, 5-step setup flow. **Security:** the Phase-1A `ownerEmail` shortcut is GONE — access is membership+RBAC.
- **Phase 3 — teacher app:** DO-workspace domain model (classes/pupils/lessons/subjects with English→reading/writing/spag strands/feedback/adaptations) + `seedDemoSchool`; the 9 screens under `apps/platform/src/routes/uniti/*` ported faithfully from the prototype; 12 Svelte primitives in `src/lib/uniti/`; self-hosted Plus Jakarta Sans; truthful SyncChip.
- **Phase 4 — offline:** IndexedDB Outbox + replay (backoff, server-dedupe idempotency) + schema upcasters + Background Sync in the existing platform SW; feedback/outcomes capture fully offline.
- **Phase 5 — AI Broker + adaptations:** governed broker (RBAC→AI-setting→budget→safeguarding-exclusion→pseudonymise→content-hash cache→model→schema-validate→audit→eval-log); deterministic rules generator (no keys) + Workers-AI path when `env.AI` present; cards as `adaptation.generated` events; no-deficit-language enforced.
- **Phase 6 — "What Works" memory:** deterministic per-pupil aggregates (recurring needs, strategies w/ success%, evidence-linked, emerging/established thresholds) + optional AI narrative; pre-seeds the adaptation loop; "What helps [pupil]" tab.
- **Phase 7 — MIS:** `DataSourceAdapter` + CSV/manual adapters + complete (gated) Wonde adapter; sync engine with preview-diff, leaver-deactivation (tombstone, historic feedback survives), append-only apply; roster UI.
- **Phase 8 — leadership:** rollups (subject progress w/ English drill-down, inclusion SEND/EAL/FSM, top strategies per group, adaptation impact, pupils-to-revisit), print-friendly export, honesty guard ("lesson feedback evidence").
- **Phase 9 — compliance:** full data export, erasure (school + per-pupil), retention + daily cron, AI-audit/consent/break-glass view, safeguarding-note restriction, DPIA/DPA/privacy docs (`docs/uniti-compliance/`), `/uniti/privacy` screen.
- **Branded login:** `/uniti/login` — the prototype's teal split-panel (school branding, SSO/magic-link/shared-device/demo, trust cues); all `/uniti/*` unauthenticated → here. **Demo: "sign in as Sarah Mitchell"** (non-prod gated) provisions+seeds St Jude's and lands on Today — the instant demo entry.

### Dev / demo run (verified)
From `apps/platform`: `bun run db:migrate:local` → `bun run build` → `bunx wrangler dev --local --port 8788`. **This is the only local mode with D1+DO+KV** (`vite dev` lacks the DO → data screens 500). Open `/uniti/login` → "Demo: sign in as Sarah Mitchell".

---

## LEFTOVER ACTIONS (for Codex)
### A. ⚠️ Prod deploy — reconcile first, do NOT blind-deploy
Prod runs the **dock-desktop-redesign** branch (deployed `37a04f24`), never merged to `main`. This branch is off `origin/main`, so `wrangler deploy` from here would **revert the live dock redesign + Codex's in-flight prod state.** Steps: (1) rebase/merge the Uniti commits onto the real prod tip (dock-redesign + Codex's committed work); resolve overlaps in `wrangler.toml` (the `SCHOOL_WORKSPACE` DO binding + migration tag `v-uniti-1`), `bun.lock`, `db/schema/index.ts`, the worker wrapper re-export, crons. (2) Apply the Uniti D1 migrations (`0039`–`0041`) to prod `shippie-platform-d1`. (3) generator → `bun run build` → `bunx wrangler deploy`. (4) Verify `/uniti/login` + demo provision live. "Private" = `visibilityScope='private'` + auth-gated; not publicly listed.

### B. External switch-ons (code is complete + gated; just set secrets/config)
- **SSO:** `wrangler secret put GOOGLE_CLIENT_ID/SECRET` + `MICROSOFT_CLIENT_ID/SECRET` (+ `MICROSOFT_TENANT`). Buttons show "Ask your admin to enable" until set.
- **Wonde:** `WONDE_API_KEY` + store the real Wonde school id in instance config (currently uses the slug as placeholder); validate commercial access/pricing. CSV/manual works now.
- **AI:** add a Workers AI `[ai]` binding (or AI Gateway + provider key) → broker uses it; absent → deterministic rules path (offline-safe).

### C. Known issues (not ours / minor)
- `@shippie/analyse > showcase-recipe classifies as Connected` is RED on `origin/main` (base commit `7ff44d09`, unrelated to Uniti). The catalog-drift test needs a full `bun run prepare:showcases` bake to reconcile (worktree bake-state artifact). Neither affects Uniti.
- Mobile Today lesson-timeline is slightly squished (minor polish). "Shared device — quick pick teacher" currently routes to the demo/magic-link flow (full quick-pick is a future nicety). `Branding` contract lacks `meta`/`term` fields (login uses sensible fallbacks).

### D. Recommended before real schools
A formal `requesting-code-review` pass on `origin/main..feat/uniti-cloudlet-phase-1a`; the interactive 2-login boundary proof (Phase 1A §Task5 step3); persist UsageMetering so AI budgets actually cap (currently `Infinity`).
