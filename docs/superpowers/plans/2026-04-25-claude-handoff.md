# Claude Code Handoff — Shippie Local Runtime Build

Date: 2026-04-25 (updated by Claude Code, second pass)
Branch: `codex/shippie-week1-day1`

## What landed in this session (Claude pass)

Five additional pillars closed on top of Codex's slice:

1. **PGlite test harness fix.** New `apps/web/lib/test-helpers/pglite-harness.ts` exposes `setupPgliteForTest()` + `teardownPglite()`. The three previously-broken tests now pass: `access/check.test.ts`, `deploy/wrap.test.ts`, `shippie/leaderboards.private.test.ts`.
2. **Capability proof telemetry.**
   - `packages/local-runtime/src/telemetry.ts` — `recordCapabilityProof()` posts via `navigator.sendBeacon` to `/__shippie/beacon`, deduped by event name.
   - Auto-emits `local.opfs_probe` on attach, `local.db_used` on `db.create/insert`, `local.files_used` on `files.write`, `local.persist_granted|denied` on `db.requestPersistence()`, `local.ai_model_cached` after AI inference.
   - `apps/web/lib/shippie/capability-proofs.ts` — queries `app_events` (single-app + batched).
   - `apps/web/lib/shippie/capability-badges.ts` — `publicCapabilityBadges(report, proofs?)` overlays proven capabilities; flips `not_tested → pass` and adds `proven: true`.
   - Marketplace listings (`/apps`) and detail page (`/apps/[slug]`) now render proven badges from real telemetry, not just static manifest claims.
3. **Recipe Saver v2 demo bar.** `templates/local-recipe-saver/index.html` now ships restore from `.shippiebak`, persistence prompt, storage usage / quota warning, last-backup display.
4. **Real local AI adapter.** `packages/local-ai/src/transformers-adapter.ts` wraps `@huggingface/transformers` via an injected `transformersLoader` (zero hard dep, testable). Embeddings (mean-pooled normalized), zero-shot classification, sentiment. Vision/generation deferred. Configures `env.remoteHost = models.shippie.app`. Wired into `createLocalRuntime({ aiFactory })` so AI is lazy-loaded only when used.
5. **Vector search demo.** `templates/local-journal/` writes entries → `ai.embed` + `ai.sentiment` → SQLite BLOB → `db.vectorSearch` for semantic recall. The first proof of Pillar D end-to-end.

## Verified Green

```bash
bun run typecheck   # 17 packages, all green
bun test packages/local-runtime/src/telemetry.test.ts \
         packages/local-ai/src/transformers-adapter.test.ts \
         apps/web/lib/shippie/capability-proofs.test.ts \
         apps/web/lib/access/check.test.ts \
         apps/web/lib/deploy/wrap.test.ts \
         apps/web/lib/shippie/leaderboards.private.test.ts
# 29 pass, 0 fail
```

The Codex-proven tests still pass (sqlite, wa-sqlite, loader, wrapper-compat-report).

## Next Implementation Steps

In priority order:

1. **Browser-validate Transformers.js.** Pre-cache a real model on `models.shippie.app/runtime/transformers.js` and ship Local Journal as a Shippie deploy; verify embeddings actually return ~384-dim vectors and `db.vectorSearch` returns sensible matches on real text.
2. **Wire `aiFactory` in `attachLocalRuntime` default path.** Today the runtime defaults to `unsupportedAi()`; switching it to a `transformersLoader` that does `import('https://models.shippie.app/runtime/transformers.js')` makes AI live by default for opted-in apps.
3. **Local AI proof on actual model load.** Currently `local.ai_model_cached` fires after first inference; better: fire when the loader has all required chunks cached (true cache proof).
4. **Pillar E install signature animation** — the 800ms icon-flight moment from the vision. Wrapper has spring + view-transitions; the install confirm flow should compose them.
5. **Pillar E audio palette** — three sprite packs (`sounds/{warm,minimal,playful}/`); Web Audio playback gated on `feel.sound = true` in shippie.json.
6. **Pillar F custom-domain UI.** Worker already resolves them; control plane needs DNS-TXT verification + Cloudflare Custom Hostnames API call.
7. **Begin Gate 2 spike.** Two-subdomain test: deploy A and B both fetching from `models.shippie.app`; measure HTTP cache reuse on Chromium/Safari/Firefox via DevTools `transferSize`.
8. **Stripe billing + Pro tier badge-removal toggle.** Locked tier infrastructure is the last platform piece before launch.

## Files Most Worth Reading First (this pass)

- `apps/web/lib/test-helpers/pglite-harness.ts`
- `packages/local-runtime/src/telemetry.ts`
- `apps/web/lib/shippie/capability-proofs.ts`
- `apps/web/lib/shippie/capability-badges.ts`
- `packages/local-ai/src/transformers-adapter.ts`
- `templates/local-recipe-saver/index.html`
- `templates/local-journal/index.html`

## Open Items / Known Gaps

- All work is in the working tree on `codex/shippie-week1-day1`; **nothing is committed yet**. The branch is identical to `main` in commit history. Stage/commit when you're ready.
- Recipe Saver and Journal templates aren't deployed anywhere — they're just in `templates/`. Shipping them through `/api/deploy` or via `shippie deploy` from CLI is the next end-to-end check.
- `models.shippie.app/runtime/transformers.js` does not exist yet. The adapter is honest about this — production browser path needs the CDN bucket populated before Pillar D claims work in production.
- `local.persist_granted` proof is recorded only when the user clicks "Ask the browser to persist data" in Recipe Saver. No automatic prompt — by design (engagement-gated per Gate 3).
- The Codex `bun-exit-99` issue is closed; with the harness helper, the access/wrap/private-leaderboard files no longer pollute the global PGlite handle.
