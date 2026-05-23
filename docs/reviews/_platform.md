## apps/platform — Shippie Container & Marketplace

**Current strengths:**
- Unification URL chain is tight: `/apps/<slug>` → 302 → `/run/<slug>/` → 302 → `/container?app=<slug>&focused=1`. `showcase-slugs.ts:14–71` handles 20+ legacy reroutes cleanly.
- AppSwitcherGesture polish — 200ms spring with 1.03 overshoot, edge-swipe + bottom-pill + Escape triggers, prefers-reduced-motion respected, sub-threshold haptic feedback for failed swipes.
- Bridge safety invariants (P1A.1–P1A.3): apps.list overlap-only (+page.svelte:1390–1427), agent.insights provenance filter (lines 1444–1470), data.transferDrop per-(source,target) grant flow (lines 1523–1574).

**UI polish (marketplace + container chrome):**

1. **AppSwitcherGesture back-edge swipe is invisible.** The right-edge back-gesture (+page.svelte:193–220) fires silently when `canGoBack` is true; first-time users have no visual cue. Add a subtle pulse/fade on the back-edge grabber (AppSwitcherGesture.svelte:271–281) when `canGoBack` first becomes true, dismiss after 500ms.
2. **Frame-loading overlay lacks "still loading" signal.** RocketLoader (AppFrameHost.svelte:142–146) starts timing on boot; after 5s show "This is taking longer than usual…" beneath the spinner. Wire `frameStates[appId].bootsince` → derived label.
3. **Modal queue size is invisible.** When intents + transfers queue (e.g., app A wants sensor.location, then app B wants sensor.camera), neither modal hints there's a queue behind it. Add a "1 of 2" badge in the Sheet title; extract queueIndex/queueSize from the parent's pending arrays.
4. **Focused-mode QR flicker on re-open.** `activeToolUrl` derivation (+page.svelte:571–594) re-fires on `focusedToolOptionsOpen` change; opening/closing fast shows previous URL briefly. Dedupe by `activeApp.id + focusedToolOptionsOpen` and bail if activeApp changes mid-generation.
5. **Transfer-drop has no pending state.** TransferPromptModal (P1A.5) hangs the drag UI while permission resolves. Track `transferPending` Set of `(sourceId, targetId)` pairs and show a subtle progress indicator.

**UX flow (open / switch / intent / transfer):**

6. **Modal stacking bug — intents + transfers can overlap.** pendingIntentQueue and pendingTransferQueue both render flat. Replace with a unified queue: `type PendingPrompt = { kind: 'intent' | 'transfer'; data: ... }` and a single modal slot that serialises resolution. Also unlocks rec #3.
7. **`Escape` is double-bound in focused mode.** `handleFocusedChromeKeydown` (+page.svelte:764–770) closes options; AppSwitcherGesture (lines 230–235) closes the drawer. Reconcile: if drawer is open, Escape closes it first; only close options after the drawer is shut.
8. **Focused-mode back-gesture timeout has no cleanup.** `requestActiveFrameBack` (+page.svelte:1245–1258) fires a 900ms fallback that opens the drawer; the setTimeout is never cleared if the user switches apps mid-timeout. Store `pendingFocusedBackFallbackTimer` and clear in `onDestroy`.
9. **Gesture tuning constants are inline.** AppSwitcherGesture hardcodes `ENTRY_DURATION_MS = 200`, `APP_SCALE_AT_OPEN = 0.95`, `SPRING_OVERSHOOT = 1.03` (lines 78–82). Move to `lib/container/app-switcher-gesture.ts` so `/dev/gesture-prototype` has a real source of truth.
10. **First-run hint is one-shot and undocumented.** The Shippie mark pulse fires once via localStorage (+page.svelte:201) but there's no copy explaining it. Add a transient tooltip on first `focusedDrawerOpen`: "Tap the Shippie mark to see all your tools" (4s fade).

**Feature additions:**

11. **Insight-to-app jump loses context.** `agentInsights` (+page.svelte:517–553) surfaces things like "Palate has 3 recipes to try"; clicking opens Palate but the insight ID isn't carried. Add `?highlight-insight=<id>` to the redirect so apps can pulse the relevant rows.
12. **"Open in container" CTA missing on listing pages.** /apps/[slug]/+page.svelte:118 only shows the standalone "Open [name]". For `isFirstPartyShowcase(slug)`, add a second CTA → `/run/${slug}/?focused=1` so users discover the container experience.
13. **Marketplace search has no category fallback.** `suggestApps` / `suggestCategories` (+page.svelte:63–70) offer apps but not categories. Add a third fallback line: "Browse [closest matching category]" when search returns nothing.

**Cleanup / tightening:**

14. **Dead /apps route is a 301 redirect only.** apps/+server.ts:12 redirects `/apps/?q=...` → `/?q=...`. Vestigial but supports old share links — add a v2 comment so future maintainers don't delete it.
15. **Duplicated intent-prompt CSS** across IntentPromptModal (lines 59–108) and TransferPromptModal (lines 52–100). Extract `lib/container/prompt-modal.module.scss`; @import in both. Preps for rec #6 (unified modal).
16. **InsightStrip renders empty DOM.** Always mounted in DashboardHome (line 71) but most sessions have zero insights. Add `{#if insights.length > 0}` guard.
17. **Three parallel frame state maps.** `frameStates`, `frameCanGoBackByApp`, `frameLifecycleByApp` (+page.svelte:223, 236–237, 887–889). Consolidate to a single `framesByAppId: Map<string, FrameInfo>` to simplify cleanup in `disposeApp` (lines 882–891).
18. **`launchVisibleApps` derived but only used inside DashboardHome.** Move the filter into DashboardHome as a local `$derived`; the parent doesn't need it.
