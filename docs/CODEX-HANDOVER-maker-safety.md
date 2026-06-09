# Handover — Maker App Safety Enforcement (for Codex)

Status as of 2026-06-09. All work is **committed + pushed** on `feat/dock-harmonization`
(11 `feat(safety)`/`fix(csp)` commits, `4704cb4b` … `b1e1a4f9`). Full platform test
suite green (190 files / 1345 tests). Plan: `docs/superpowers/plans/2026-06-08-maker-app-safety-enforcement.md`.

All 5 phases of the plan are built + tested:
1. **Real-time kill switch** — dedicated `apps:{slug}:suspended` KV key, enforced as a 451 in `runAccessGate`; admin suspend fails loud; unarchive fully reinstates; deploy-completion guard.
2. **CSP/framing** — `PLATFORM_FRAME_ANCESTORS` across finalizer + both CSP builders; `x-frame-options: DENY` removed.
3. **User reports** — `app_reports` table, anon endpoint, `/admin/reports` queue with suspend.
4. **Update monitoring** — behavior-delta per deploy, `/admin/updates` feed.
5. **Transparency** — user-safe "What Shippie checked" badges on `/apps/[slug]`.

## Last items to complete (Codex)

1. **Unblock the build.** `bun run health` / `build` / `prepare:generated` was failing on
   `showcase-coffee (missing src/main.tsx)` (the in-flight "lot"/coffee rebuild). HEAD
   `56d70934 fix(coffee): resolve mounted font assets` looks like it addresses this —
   **confirm `bun run health` is green from the repo ROOT** before deploying. (The safety
   code itself is green via `svelte-check` directly — it is not the blocker.)

2. **Apply the two new migrations to PROD D1** before/with deploy — they are additive:
   - `0057_app_reports.sql` (new `app_reports` table)
   - `0058_deploy_behavior_delta.sql` (`ALTER TABLE deploys ADD COLUMN behavior_delta_json`)
   Run: `cd apps/platform && bun run db:migrate` (remote). Both verified clean on local D1.

3. **Deploy.** Standard stack sequence: generator → `bun run build` → `bunx wrangler deploy`
   (build must run between prepare-showcases and deploy or assets are a no-op).

4. **Post-deploy smoke check (2 min):**
   - Admin → `/admin/reports`, suspend a throwaway app → its `slug.shippie.app` returns the
     451 "removed" page; unarchive → serves again (allow ~30s for the KV meta memo) and the
     slug is redeployable.
   - Open any app inside the Dock → it still frames (regression check for the X-Frame-Options
     removal; `frame-ancestors` now governs framing).

## Deferred (documented in the plan, NOT built — pick up if desired)
- Plain maker-cleanup archive does **not** stop serving (only *suspension* does) — product call.
- Maker self-service **appeal** flow for false-positive takedowns (reserved-slug hold is released on unarchive, but there's no maker-facing appeal UI).
- Custom-domain shadowing audit.
- Confirm `reap-trials` / `reconcile-kv` clear KV + R2 (not just D1) on trial expiry.

## Notes
- Built in the shared main tree with explicit per-file staging (never `git add -A`) while you
  were committing golazo/feeds/coffee concurrently — no file overlap with your zones.
- Enforcement latency is intentional: KV propagation + a 30s per-isolate `loadSuspension`
  memo. Near-real-time, documented. For an instant global kill an admin can also purge the
  active pointer.
