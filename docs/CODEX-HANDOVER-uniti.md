# Codex Handover — Uniti on Shippie Private Cloud

**Date:** 2026-06-07 · **Branch:** `feat/uniti-cloudlet-phase-1a` (pushed to origin, off `origin/main`) · **Author:** Claude

## What's DONE (built, tested, pushed)
**Phase 1A — the reusable private-cloud vertical slice — is complete and green** (except one pre-existing unrelated failure, see §C). Commits on the branch:
- `f49d7d2d` `@shippie/cloudlet-contract` (reusable contracts: roles, events, PrivateAppProvisioning)
- `f7bcb5bf` Phase 0 design system + Phase 1A/master plans + prototype reference (`docs/uniti-design-reference/`)
- `7964c8b1` `private_app_instances` control-plane table (migration **`0039`**) + Drizzle schema
- `97a8bd42` `SchoolWorkspace` Durable Object (SQLite) + Node-testable `WorkspaceStore` (append-only events + `workspace_schema_version` + audit)
- `108f751d` `createPrivateAppInstance` provisioning (control-plane row + DO workspace + **Shippie `apps`(private)+`spaces`/`space_apps` install record** + audit)
- `ef18058f` provision + scoped event API (`/api/cloudlet/instances` + `/instances/[slug]/events`) with instance-boundary guard
- `340b0c6c` minimal `/uniti` office-manager flow (Uniti design tokens)

**Health:** typecheck 104/104 · platform 830 tests (incl. 9 cloudlet specs) · platform build exit 0 · contract bun:test green. Files changed are scoped to `cloudlet/`, `uniti/`, `db/schema`, `wrapper/env.ts`, `wrangler.toml`, `bun.lock`, `docs/`, `packages/cloudlet-contract` — **no unrelated/Codex files touched**.

**Design locked:** `docs/superpowers/plans/2026-06-07-uniti-phase-0-design-system.md` (teal `#1B9B7A` / marigold `#E8953A`, Plus Jakarta Sans, 6 feedback states, 8 screens). Source prototype: `docs/uniti-design-reference/`. **Build the teacher UI strictly to this.**

---

## LEFTOVER ACTIONS (in priority order)

### A. ⚠️ Deploy — DO NOT blind-deploy this branch (it would revert prod)
Production currently runs the **dock-desktop-redesign** branch (deployed `37a04f24`), which was **never merged into `main`**. This branch is off `origin/main`, so `wrangler deploy` from here would **revert the live dock redesign + clobber any of Codex's in-flight prod state.** Required sequence:
1. **Reconcile first:** rebase/merge the 7 cloudlet commits onto the *actual prod tip* (the dock-redesign branch, plus Codex's committed in-flight work) — or cherry-pick `7964c8b1..340b0c6c` onto the current prod branch. Resolve any `wrangler.toml`, `bun.lock`, `db/schema/index.ts` overlaps.
2. **Apply the prod D1 migration** `0039_*private_app_instances*` to `shippie-platform-d1` (use the repo's real migrate command from `apps/platform/package.json` — wrangler reads `drizzle/*.sql` directly).
3. **Deploy** per CLAUDE.md: generator → `bun run build` → `bunx wrangler deploy` (build MUST run before deploy or assets are a no-op). The DO is wired into the worker wrapper (`wrap-worker-with-scheduled.mjs`, `_cloudlet.js` re-export of `SchoolWorkspace`) + bound in `wrangler.toml` (`SCHOOL_WORKSPACE`, migration tag `v-uniti-1`, `new_sqlite_classes`).
4. **Verify live:** `/uniti` route 200 (auth-gated); provision a school via `POST /api/cloudlet/instances` (admin); confirm the DO creates SQLite. "Private" = `visibilityScope='private'` + provisioning + auth-gating; not publicly listed.

### B. Run the end-to-end boundary proof (not runnable headless here)
`bun run dev`, then the manual steps in the Phase 1A plan §Task 5 Step 3: provision **two** schools, sign in as each office manager (Lucia), write an event to school A, confirm school B gets **403 / 0 events**, and confirm audit separation (control-plane audit for provision; DO workspace audit for the event). The boundary *logic* is unit-tested (`resolve-instance.test.ts`), but the two-login integration run is outstanding.

### C. Pre-existing health failure (not ours)
`@shippie/analyse > kind-classifier > showcase-recipe classifies as Connected` is RED on `origin/main` (introduced by the base commit `7ff44d09` recipe-import, unrelated to Uniti). Fix separately if you want fully-green health before deploy.

### D. Recommended: a formal code-quality review pass
I did a structural verification (scoping, amendments, test results) but not a full second-reviewer pass. Worth a `requesting-code-review` pass on `origin/main..feat/uniti-cloudlet-phase-1a` before merge — especially the DO SQLite wiring, the `ensureUnitiApp`/`createSpace` schema usage, and the route auth.

### E. Replace the Phase-1A-only shortcut (security)
`resolve-instance.ts` matches on `ownerEmail` — loudly marked PHASE-1A-ONLY. **Before any real school**, replace with verified SSO identity + invites + memberships + RBAC (`@shippie/access`). This is Phase 2.

---

## REMAINING PHASES (the product — each its own spec→plan)
Master plan: `docs/superpowers/plans/2026-06-07-uniti-shippie-private-cloud.md`.
- **Phase 2 — School setup:** real Google/Microsoft SSO (Lucia+Arctic), invites, RBAC; the 5-step setup flow. Replaces §E shortcut.
- **Phase 3 — Uniti app shell (`apps/uniti-school`):** render the 8 screens in SvelteKit using the Phase 0 design system. **Port the React primitives in `docs/uniti-design-reference/uniti-ui.jsx` to Svelte, keeping names + styles identical.** Self-host Plus Jakarta Sans woff2 (don't depend on the Google CDN at runtime). Wire to the cloudlet APIs.
- **Phase 4 — Offline sync engine:** the full `OfflineSync` contract (client outbox + Service-Worker Background Sync + schema upcasters + conflict policy). The DO append-only foundation is in place.
- **Phase 5 — AI Broker + adaptation engine:** structured `AdaptationCard` objects, pseudonymisation, safeguarding exclusion, spend caps, caching, eval loop. Check existing `2026-04-26-adaptive-intelligence-*` plans first to plug in.
- **Phase 6 — Pupil "What Works" memory:** aggregate-first + thresholded AI synthesis, evidence-linked, teacher-owned language.
- **Phase 7 — MIS:** `DataSourceAdapter` → CSV/manual first, then **Wonde** (validate commercial access/pricing before locking).
- **Phase 8 — Leadership rollups:** **English MUST break out into Reading / Writing / SPaG** on overview/leadership/progress (owner instruction — model English as parent with `english.reading|writing|spag` strands; roll up to "English" headline with drill-down).
- **Phase 9 — Compliance pack:** DPIA/DPA, retention, export/erasure, AI audit, consent, safeguarding, break-glass audit.

## Key facts
- Worktree: `~/Documents/Shippie/.worktrees/uniti-cloudlet-phase-1a`. Testing: `apps/platform` = vitest only; packages = bun:test. Green-light: `bun run health`.
- Deviations from plan (all sound): migration `0039` (real latest was `0038`, not `0055`); `node:sqlite` import loaded via `createRequire` in the test only (Vite rewrites a static `node:sqlite` import and fails — production DO never imports it); real `space_apps` requires `app_slug` (set to `'uniti'`); `apps.makerId` NOT NULL (set to provisioning admin); `recordAudit.after` typed `Record<string,unknown>|null`.
