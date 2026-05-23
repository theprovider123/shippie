## apps/shippie-ai — Local-AI iframe

**Current strengths:**
- Tight security boundary: explicit origin allowlist regex + adversarial-input test coverage; silent rejection prevents info leakage (`src/inference/router.ts:46`).
- Privacy-first logging: inference requests and results never reach IndexedDB — only metadata (origin, task, timestamp, backend, duration) is stored, enforcing the load-bearing "no data leaves device" promise visible on the dashboard (`src/dashboard/usage-log.ts:1–20`, `src/dashboard/App.tsx:196–202`).

**UI polish (loading / error states visible to consumers):**

1. **Add boot-readiness signalling.** Iframe sends `ReadyMessage` on boot (`router.ts:193`) but consumers blindly call `shippie.ai.run()` and may stall during Worker boot. Add an explicit `shippie.ai.ready(): Promise<void>` in `packages/iframe-sdk/src/index.ts:584–601` that resolves on `ReadyMessage`. Showcases can gate initial render on `await shippie.ai.ready()` and show "AI loading…" placeholders.
2. **Surface model download progress.** `transformers-adapter.ts:32` accepts a `progress_callback` hook but the iframe doesn't thread it back. First inference can stall 10s+ on 4G silently. Extend `AiRunRequest` with optional `progressCallback`, collect events in `src/inference/models/*.ts`, post back `{ type: 'ai.progress', requestId, task, loaded, total, status }`. Showcases can render download bars.
3. **Distinguish "downloading" from "permanently unavailable".** All AI failures collapse to `source: 'unavailable'` (`src/types.ts:58`) so apps like `showcase-journal/src/components/SentimentSparkline.tsx:79–80` hide the feature for the whole session even on a transient download. Add a new `source: 'downloading'` (or separate `status` field) so apps can show "Downloading model (50%)…" instead of silently hiding.

**UX flow (consumer integration surface):**

4. **Expose task-capability hints.** `ReadyMessage` lists supported tasks (`src/types.ts:61–65`) but the iframe-sdk doesn't re-export it; showcases hardcode their assumptions. Extend `AiRunResult` with `availableTasks?: InferenceTask[]` OR add `shippie.ai.capabilities()`. Then `showcase-shopping-list/src/AisleClassifier.tsx:73` can check upfront and render "not supported yet" instead of silently gatekeeping the UI.
5. **Per-request timeouts.** SDK hardcodes a 60s timeout (`packages/iframe-sdk/src/index.ts:596`) — generous for downloads, punishing for latency-sensitive UX (sentiment-on-every-keystroke). Add optional `timeoutMs` on `AiRunRequest`; consumers can specify aggressive timeouts (3s) when degradation is acceptable.
6. **Document the unavailable-handling invariant.** Add a JSDoc note on `ai.run` (`packages/iframe-sdk/src/index.ts:204–216`): "Showcases MUST gate AI-dependent features on `source !== 'unavailable'` and hide those features. Never render broken inference UI." Already followed by best-practice apps, but it's load-bearing and deserves to be loud.

**Feature additions:**

7. **Preload / warm-up hints.** Add `shippie.ai.preload(task: InferenceTask): Promise<void>` so e.g. pantry-scanner can call `preload('vision')` on mount, downloading in the background. The Worker can batch preloads via `requestIdleCallback`. Turns a 10s stall into a smooth experience.
8. **Per-task sampling for the usage log.** Current log records every inference (`usage-log.ts:44`) — explodes on per-keystroke sentiment (14+/sec in journal). Extend `UsageEntry` with `samplingRate?: number` so high-volume tasks log 1-in-10 by default. Dashboard stays useful (rough hourly counts) without IndexedDB bloat.
9. **Expose hardware backend detection.** Backend is detected (`src/inference/backend.ts`) and tagged on results (`src/inference/models/classify.ts:35`), but SDK fallback hardcodes a string union (`packages/iframe-sdk/src/index.ts:60`) divergent from the real `Backend` type. Unify the type + add `shippie.ai.detectBackend(): Promise<Backend>` so showcases can log "ran on CPU (slow)" vs "NPU (fast)".

**Cleanup / tightening:**

10. **Tidy the type re-export.** `Backend` re-export in `src/types.ts:88–92` is awkwardly placed at file bottom to avoid a forward reference; the `BackendForUsage` alias is internal noise. Move the re-export up after other declarations and drop the alias.
11. **Worker-deadlock circuit breaker.** `router.ts:171` listens for `worker.addEventListener('error')` but a Worker stuck in WASM computation won't emit. Add a per-request timeout inside the iframe (~90s): if no Worker response, terminate the Worker and reject the pending batch. Currently timeouts only enforced at the SDK layer.

**Verification checklist for the next pass:**
- Dashboard renders on mobile Safari without spinner loops; backend detection completes < 1s.
- Sentiment sparkline in journal hides cleanly when AI is unavailable (no broken SVG placeholders).
- Pantry scanner shows "Downloading model…" on first use rather than a silent delay.
- Usage log prune logic fires after 10+ inferences (check IndexedDB > `shippie-ai > usage`).
- Origin allowlist still rejects `https://ai.shippie.app.evil.com` and `http://recipe.shippie.app`.
