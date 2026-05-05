# 2026-05-05 — Offline + Mobile Immersion Handoff

This is the handoff note for Claude or the next implementation agent. The goal of this slice was to make Shippie feel like one local app OS, tighten the offline promise, and make the trust/privacy story visible without changing the existing design language.

## What Is Implemented

- `/run/<slug>` is now the focused Shippie shell for first-party showcase apps.
- Runtime iframe loads bypass that redirect with `?shippie_embed=1`, so static showcase bundles still load inside the container.
- `recipe` and `recipe-saver` now resolve consistently: public runtime URL stays `/run/recipe/`, container app slug stays `recipe-saver` for existing intents and permissions.
- Showcase catalog generation is the single source of truth for first-party slugs and precache entries.
- `prepare-showcases` prunes stale `static/run/*` directories after successful builds.
- Service worker marketplace fallback checks exact request, `/apps`, `/apps/`, then `/` before showing the offline page.
- Service worker warms the pinned Transformers runtime into the model cache.
- AI worker prefers warming Cache Storage before importing the runtime URL.
- The container Your Data area now has an On-device AI readiness card showing backend, runtime cache state, and model-cache entries.
- Mobile immersion is installed through the wrapper by default: press feedback, keyboard avoidance, pull-to-refresh event, back-swipe bridge, install guide sheet.
- Marketplace details now expose a public Trust Card: data location, server-content claim, external domains, permissions, offline status, and proof badges.
- Privacy copy has been tightened: no app content is stored on Shippie servers by default, but relay/signaling metadata can still exist.

## Important AI Runtime Note

Do not switch the runtime URL to `https://models.shippie.app/runtime/transformers.js` yet. On 2026-05-05 it returned `404`.

Current working runtime source:

```txt
https://esm.sh/@huggingface/transformers@3.0.0
```

This is pinned and cacheable, but it is still a CDN ESM entrypoint. That means it can reference transitive modules. The fully offline, production-grade next step is to mirror or bundle a self-hosted single-file Transformers runtime on `models.shippie.app`, then update `src/lib/container/ai-runtime.ts` and `scripts/prepare-showcases.mjs` together.

Until that mirror exists, the honest product language should be:

- Runtime cache: Shippie can warm the pinned runtime entry.
- Model cache: models download on first AI use.
- Fully offline AI: true only after the runtime and the specific model/dependency graph have been exercised successfully on that device.

## QA Completed In Repo

- `bun run --filter @shippie/platform build` passed.
- `bun run --filter @shippie/platform check` passed with existing warnings only.
- `bun run --filter @shippie/platform typecheck` passed.
- `bun run --filter @shippie/platform test` passed.
- `bun run --filter @shippie/sdk test` passed.
- `bun run --filter @shippie/sdk typecheck` passed.
- `git diff --check` passed.

## Still Needs Real Phones

These need actual iOS Safari and Android Chrome. Browser emulation is not enough.

- Open `https://shippie.app/run/recipe` and confirm it lands in the focused container shell.
- Confirm the embedded iframe uses `/run/recipe/?shippie_embed=1` and loads the Recipe app.
- Use iOS edge-swipe / Android back and confirm app history is asked first before leaving focused mode.
- Visit `/apps`, go offline, reopen `/apps`, and confirm cached marketplace fallback appears instead of the generic offline page.
- Trigger the install guide on iOS Safari and confirm the sheet teaches Add to Home Screen clearly.
- Trigger Android Chrome install prompt and confirm the native prompt appears from the custom CTA.
- Run first AI use on WiFi, then airplane mode, then repeat the same AI task. Confirm the readiness card moves from runtime/model setup to ready state.

## Do Not Touch Unless Asked

- Do not redesign the UI. All changes intentionally reuse existing Shippie panels, borders, typography, and token language.
- Do not revert unrelated local work in `apps/showcase-mevrouw/src/features/games/tod-state.ts`.
- Do not claim “no metadata exists.” The correct claim is “no app content on Shippie servers by default.”

## Suggested Next Hardening Commit

Make `models.shippie.app/runtime/transformers.js` real:

1. Publish a self-hosted, pinned Transformers runtime bundle with transitive dependencies resolved.
2. Verify it returns `200`, has CORS headers, immutable cache headers, and can be imported directly from a Worker.
3. Update `src/lib/container/ai-runtime.ts`.
4. Update `scripts/prepare-showcases.mjs`.
5. Add a test asserting the generated shell asset runtime URL equals `AI_RUNTIME_URLS`.
6. Real-phone test first AI use online, then repeated AI use offline.

## Update — Phase 2 shipped

Phase 2 of the runtime self-host landed in commit `e67fda4` on 2026-05-05, but on a different URL than this doc anticipated: same-origin proxy at `https://shippie.app/__esm/<path>` instead of a separate `models.shippie.app` zone. The proxy (`apps/platform/src/lib/server/esm-proxy.ts` + `apps/platform/src/routes/__esm/[...path]/+server.ts`) mirrors the pinned esm.sh artifact and rewrites every absolute import in JS bodies into the same `/__esm/` namespace, so the entire transitive graph stays on shippie.app after first parse. CF edge cache holds the responses with `cache-control: public, max-age=31536000, immutable`. The marketplace SW cache-firsts the whole `/__esm/*` namespace into MODEL_CACHE. A separate `models.shippie.app` zone + R2 mirror is no longer needed for the headline goal of "no third-party runtime dependency"; that path is reserved for if we later want a custom-trimmed bundle.
