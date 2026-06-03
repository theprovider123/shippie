# Dock Launch Readiness - UX/UI Plan

**Date:** 2026-06-02  
**Status:** Product decisions locked; implementation plan proposed  
**Surface:** `apps/platform`, especially `/workspace`, `/tools`, `/run/<slug>`, mobile drawer, app iframe host, maker manifest/runtime contract

## Locked Decisions

1. **Visible surface name:** use **Dock**.
   - Public/product copy: **Shippie Dock**.
   - Compact nav/tab label: **Dock**.
   - Keep `/workspace` as the canonical route for now to avoid churn; optionally add `/dock -> /workspace` later.
   - Replace user-facing "Workspace" labels with "Dock" except in technical docs where the route is being described.

2. **Logo behavior:** clicking the Shippie mark always returns to the Dock launcher/home.
   - It must not silently reopen the last app.
   - Running apps appear as resumable rows/cards in Dock.
   - Deep links and explicit `?app=<slug>` still open the app.

3. **Background behavior:** switching away mutes tools by default.
   - Cooperative apps receive a host lifecycle message and mute/pause.
   - Non-cooperative or legacy apps are safely suspended/unmounted after a short grace period if they cannot acknowledge background mute.
   - Users can still explicitly keep an app running where that makes sense.

4. **Maker model:** one responsive app by default, with declared host layout modes.
   - Makers should not have to build separate mobile and desktop apps.
   - The host provides viewport, safe-area, chrome, input, and lifecycle signals.

5. **Shippie mark:** use the Shippie icon/rocket consistently.
   - No mixed `S` mark in one place and rocket/icon in another.
   - Monograms remain for app icons only, not Shippie shell controls.

6. **One Save action:** there is only one "save" concept.
   - Saving a tool means: add it to the Dock **and** make it available offline.
   - Do not split this into star/save/pin/download/offline controls in primary UI.
   - Closing a running tool is not deleting it.
   - Removing a saved tool is a separate Manage action and should clearly say what happens to the offline copy.
   - Product row name is **Saved**, not Pinned. Existing pinned data can migrate into Saved, but the visible model should not expose both.
   - Offline-ready must be shown as a separate status derived from the offline cache, not inferred from Saved.

7. **Mobile tab behavior:** the Tools tab opens the same Tools drawer.
   - Dock tab goes to the Dock launcher.
   - Tools tab summons the drawer/switcher overlay; it does not navigate to an old launcher or catalog page.
   - Browse/catalog remains reachable from inside the drawer as "Browse all tools".
   - Do not keep "Today" as a parallel product concept in this launch pass. If a future Today feed exists, it should be content inside Dock, not a primary nav surface.

## Review Tightenings

These are load-bearing implementation contracts verified against current HEAD after the first drawer work (`aab92edd fix(workspace): make tool drawers scalable`).

1. **Fix the boot auto-resume trap explicitly.**
   - Current boot logic can set `activeAppId = openAppIds[0] ?? null` on plain `/workspace`, which violates "logo -> Dock home".
   - Sprint 1 must change the boot contract: only `data.focused`, explicit `?app=<slug>`, or a user click can activate a tool.
   - Plain `/workspace` always means Dock launcher with `activeAppId = null`, while `openAppIds` remains intact for Running rows.

2. **Use a shallow Dock-home action inside the Dock shell.**
   - A hard `<a href="/">` remount can cold-reload iframes and re-run boot.
   - From inside `/workspace` or `/workspace?app=<slug>`, the Shippie mark should perform an in-page Dock-home action: close overlays, clear active tool, preserve `openAppIds`, and update URL to `/workspace`.
   - Outside the Dock shell, ordinary links to `/workspace` are fine.

3. **Add a real Saved state.**
   - `launcher-memory` currently has pinned and recent, not saved.
   - Add `saved: string[]` as the source of truth for "in Dock".
   - Migrate existing `pinned` entries into `saved` for compatibility.
   - Do not introduce a separate visible Pinned row in Sprint 1. If ordering/favorite behavior is needed later, it belongs in Manage.

4. **Model Save as two states with partial failure.**
   - In-Dock state: `launcher-memory.saved`.
   - Offline-ready state: `cached-slugs` / service-worker cache.
   - The offline badge and launch confidence must derive from cached/offline state, never from the saved flag alone.
   - It is valid to show "Saved to Dock, offline copy still downloading" if local save succeeds and pre-cache is pending.

5. **Re-baseline Phase 2 before building more drawer work.**
   - `aab92edd` already added `tool-switcher.ts`, selector tests, row-based `ToolSwitcherSheet.svelte`, close actions, and scroll-lock verification.
   - Before Phase 2 implementation, diff the current drawer against this plan and build only the missing pieces: Save/offline state, category/large-list scaling, clearer browse action, and repeated seeded tests.

6. **Scope suspend fallback carefully.**
   - Unmounting a background iframe can lose unsaved in-memory state.
   - Suspend-after-grace is only for game/audio-prone tools or tools that declare background behavior.
   - Never suspend a tool that has signaled unsaved in-memory state.
   - Non-cooperative tools can still be closed manually by the user.

7. **Launch gate.**
   - Launch readiness should gate on Sprint 1 and Sprint 2.
   - Sprint 3 and Sprint 4 are important product hardening, but not blockers for the immediate Dock launch unless tests reveal a regression.

## Core Diagnosis

The Dock is much closer after Workspace 1.1, but launch readiness now depends on product consistency and runtime rules, not just layout:

- The user needs to know "where am I?" and "how do I get back?" every time.
- The drawer must scale to hundreds or thousands of apps without becoming an unlabeled icon wall.
- The Dock must be a safe home surface, not an auto-resume trap.
- Saving must be a single trustworthy action: saved = in Dock + offline.
- Background apps must not make noise unless the user clearly asked for that.
- Games and mobile-first apps need a host sizing contract that preserves intent.
- System surfaces like permissions, Data, Access, Save, Share, and Browse need clearer language and feedback.

## User Hats

### New Visitor
- Lands on Dock, sees a friendly local-tools launcher, not a formal "workspace".
- Understands what saved, running, and recent mean.
- Can browse tools without learning platform internals.

### Returning Phone User
- Tapping Shippie returns to Dock.
- Running apps are visible with Resume and Close affordances.
- Drawer opens as a clear list, scrolls inside itself, and never scrolls the app behind it.
- Tapping Tools opens the same drawer everywhere; no surprise route change.
- Save means the tool is ready later, including offline.
- Switching away from a game stops confusing background sound.

### Returning Desktop User
- Dock is a launch surface with Running, Saved, Recent, then Browse.
- Saved tools are offline-ready by definition.
- Active app remains immersive.
- Drawer/command/search overlays the app and never resizes it.
- Mobile-preferred apps are staged intentionally instead of stretched.

### Power User With Hundreds Of Apps
- No giant icon grid.
- Search is fast and local.
- Running/Saved/Recent stay small and high-priority.
- Browse uses categories, filtering, alphabetic groups, and virtualization/pagination.

### Maker
- Builds one responsive app.
- Declares layout needs in `shippie.json`.
- Gets host CSS vars and SDK events for viewport, safe areas, chrome visibility, lifecycle, input type, and background mute.
- Deploy validation screenshots catch broken mobile/tablet/desktop layouts.

### Game Maker
- Declares `fixedAspect` or `gameCanvas`.
- Host fit-contains the game, preserves aspect ratio, and avoids stealing bottom/edge gestures in declared input regions.
- Switching away sends pause/mute and can suspend the iframe.

## Phase 1 - Dock Identity And Safe Home

**Goal:** make the Dock feel friendly, obvious, and safe to return to.

### Tasks

1. Rename visible shell labels.
   - `Workspace` -> `Dock` in rail headers, mobile tab labels, drawer titles, empty state, page metadata, and offline fallback copy.
   - Product copy uses "Shippie Dock" where extra clarity helps.
   - Keep `/workspace` route names in code comments only where route accuracy matters.

2. Make Shippie logo a true Dock-home link.
   - Nav logo, focused drawer brand, mobile Dock tab, and any "home" buttons go to `/workspace` with no `app` param.
   - Route-state logic treats `/workspace` without `?app=` as home: `activeAppId = null`.
   - Open apps remain warm/running in `openAppIds`; they show in Running, not as the current screen.
   - Inside the Dock shell, implement this as a shallow in-page action, not a full remounting navigation.
   - Explicitly remove boot fallback that auto-activates `openAppIds[0]` on plain `/workspace`.

3. Add a Resume area to Dock home.
   - First row: Running apps with Resume and Close.
   - Second row: Saved.
   - Third row: Recent.
   - Browse is below personal context.

4. Keep route semantics clean.
   - `/workspace` = Dock launcher.
   - `/workspace?app=<slug>` = immersive app.
   - `/run/<slug>` = standalone/deep-link runtime.
   - `/tools` = full catalog/browse.

### Acceptance

- Clicking Shippie from any active app lands on Dock, not directly inside an app.
- The active app disappears, but Running rows remain.
- Running iframes stay warm after shallow Dock-home navigation.
- Browser back from `/workspace?app=<slug>` behaves predictably.
- Mobile bottom nav says Dock / Tools / You, and Dock opens the launcher.

## Phase 2 - Scalable Drawer And Save Feedback

**Goal:** make the tool drawer understandable and usable at 10, 100, and 1000 apps.

### Tasks

0. Collapse save/pin/offline into one mental model.
   - Primary action label: **Save**.
   - Saved state label: **Saved** or **Saved to Dock**.
   - Result of Save:
     1. Add the tool to the user's saved Dock set.
     2. Pre-cache/package it for offline launch.
     3. Show it in the Saved personal section.
     4. Show toast/progress if offline caching takes longer than a quick tap.
   - Do not expose separate "Pin", "Star", "Download", and "Offline" primary buttons.
   - If we need ordering/favorites later, call it "Move up" or "Favorite" in Manage, not Save.
   - Data model:
     - `launcher-memory.saved` stores "in Dock".
     - Existing `launcher-memory.pinned` migrates into `saved`.
     - `cached-slugs` stores "offline-ready".
     - The UI may show both Saved and Offline-ready, but Save is one user action.

1. Keep rows as the primary drawer surface.
   - Running, Saved, Recent, Browse.
   - Each row includes icon, name, category/status, and optional actions.
   - Running rows include Close.
   - Saved rows show Saved state.
   - Browse rows include Save.

2. Replace icon-only bulk browsing with scalable browse behavior.
   - For more than a small threshold, Browse is category/filter driven.
   - Search appears at the top and filters across name, slug, category, tags, and maker.
   - Render capped sections, then virtualized/paginated results for large lists.
   - Do not render hundreds of rows at once.

3. Make Save visible and trustworthy.
   - Save updates immediately, then offline caching progress follows.
   - Toast sequence:
     - "Saving to Dock..."
     - "Saved to Dock - available offline"
     - Failure: "Saved to Dock, offline copy still downloading" or "Could not save offline"
   - Drawer and Dock home update without reload.
   - Saved state persists in `launcher-memory`.
   - Offline availability persists through `cached-slugs` / service-worker pre-cache.
   - The UI should never imply a tool is launch-ready offline until the offline copy is confirmed.

4. Improve drawer discoverability.
   - Use the Shippie icon handle consistently.
   - Handle has enough contrast and a short label for early sessions: "Tools".
   - When apps are running, show a tiny count badge.
   - Fade down only after the user has demonstrated they know the drawer; do not make the first-run handle too faint.

5. Lock scroll correctly.
   - Drawer content scrolls internally.
   - Page/app behind never scrolls while drawer is open.
   - Body lock releases on close.
   - Keyboard search does not break sheet height on iOS.

### Acceptance

- Implementation starts by re-baselining against `aab92edd`; do not rebuild the row drawer already shipped.
- With seeded 1000-app data, drawer opens under budget and does not create a huge DOM.
- Three repeated mobile tests: scroll drawer, page behind remains fixed.
- Three repeated launch tests: pick an app, drawer closes, app is full-screen.
- Three repeated Save tests: Save from drawer/catalog, reload, tool appears in Dock and launches offline.
- Save/Remove copy clearly distinguishes saving/offline from closing a running app.

## Phase 2b - Mobile Tab And Drawer Navigation Contract

**Goal:** bottom navigation must feel obvious: Dock is home, Tools is the drawer.

### Recommended Model

Mobile primary nav:

- **Dock** - returns to the Dock launcher/home.
- **Tools** - opens the Tools drawer/switcher overlay.
- **You** - account, settings, docs, shipping, data/account-level surfaces.

Desktop equivalents:

- Shippie logo / Dock label returns to Dock launcher.
- Shippie icon handle opens the Tools drawer/switcher overlay.
- Browse all tools opens `/tools`.

### Tasks

1. Rename the mobile "Today" tab to "Dock".
   - Current phase wants one mental model: Dock = the user's local app home.
   - Remove "Today" from launch-critical navigation and copy.

2. Make Tools tab a pure drawer summon.
   - If already on `/workspace` or `/workspace?app=<slug>`, open the drawer in place.
   - If elsewhere, navigate to `/workspace`, then open the drawer after route settles.
   - Do not send the user to `/tools` directly from the Tools tab.

3. Put Browse inside the drawer.
   - Drawer top/bottom action: "Browse all tools".
   - That action goes to `/tools`.
   - The drawer remains the switcher; `/tools` remains the catalog.

4. Avoid stale launcher routes.
   - No Tools/Search action should route to an old launcher page or marketing landing.
   - `/apps` compat redirects to `/tools` remain for old links only.

### Acceptance

- Mobile Dock tab -> `/workspace` with no active app.
- Mobile Tools tab -> drawer opens.
- Drawer Browse all -> `/tools`.
- From active app, Tools opens overlay and selecting a row closes it.
- Run the above three times on mobile viewport and once on tablet/desktop.

## Phase 3 - Background Audio, Mute, Pause, And Close

**Goal:** switching tools should never leave confusing sound behind.

### Tasks

1. Add host lifecycle messages.
   - New event, for example `shippie:host-lifecycle`.
   - Active app receives `foreground`.
   - Inactive apps receive `background` with `{ muted: true, reason: 'switch-away' }`.
   - Apps acknowledge with `background-ready` / `muted`.

2. Add SDK hooks.
   - `useHostLifecycle()`.
   - `useBackgroundMute()`.
   - Helpers for pausing audio/video/canvas loops.
   - CSS var or data attr for `hostChromeVisible`.

3. Add enforceable fallback.
   - Host cannot reliably mute arbitrary cross-origin iframe audio without cooperation.
   - If a background app does not acknowledge mute, suspend/unmount it after a short grace period for game/audio-prone categories.
   - Show status in drawer: Running, Muted, Paused, Suspended.
   - Do not suspend an app that reports unsaved in-memory state.
   - For non-game/non-audio tools, prefer muted/background lifecycle and manual close over automatic unmount.

4. Make manual close easy.
   - Running rows in Dock and drawer have `x`.
   - Tool options panel includes Close tool.
   - Closing destroys iframe/bridge state but does not delete local data or uninstall the tool.
   - Closing never changes Saved/offline status.

5. Add keep-running exception.
   - For timers/music/voice apps, manifest can request `background: allowed`.
   - User-facing toggle: "Keep running in background".
   - Default remains mute/pause.

### Acceptance

- Switch away from a game/audio demo three times: sound stops each time.
- Closing a running app removes it from Running and destroys the iframe.
- Returning to a suspended app relaunches cleanly with local data intact.
- Unsaved-state demo is not auto-suspended.

## Phase 4 - Maker Viewport And Game Sizing Contract

**Goal:** apps feel designed on mobile and desktop without requiring separate apps.

### Tasks

1. Finish manifest layout fields.
   - `layout: responsive | mobilePreferred | desktopPreferred | fixedAspect | gameCanvas | immersive`.
   - `aspectRatio?: string`.
   - `safeEdges?: none | bottom | all`.
   - `background?: muted | paused | allowed`.

2. Finish platform parsing and propagation.
   - Validate in `shippie.json`.
   - Store in deployed app metadata.
   - Feed `ContainerApp.layout` and `aspectRatio`.
   - Apply to first-party curation generation too.

3. Upgrade stage sizing.
   - `responsive`: fill available stage.
   - `mobilePreferred`: centered phone-width stage on desktop, full-width on phones.
   - `fixedAspect`: fit-contain with letterboxing.
   - `gameCanvas`: dynamic fit-contain, aspect aware, orientation aware, no clipped controls.
   - `desktopPreferred`: small-screen warning or scaled stage when required.

4. Push host signals to apps.
   - `viewportMode`: mobile/tablet/desktop.
   - `stageWidth`, `stageHeight`, `safeArea`, `inputType`.
   - `hostChromeVisible`.
   - `backgroundMuted` / lifecycle.

5. Add maker QA gates.
   - Screenshot at 390x844, 768x1024, 1440x900.
   - Fail on horizontal overflow, clipped primary controls, unreadable text, or unsafe bottom overlap.
   - Add game-specific fixed-aspect smoke.

### Acceptance

- Tab/mobile-preferred tools stage as phone-width on desktop.
- Games do not stretch oddly; they fit the viewport with intentional letterboxing.
- Maker docs explain one responsive app plus layout modes.

## Phase 5 - Search, Browse, Data, Access, And Permissions

**Goal:** system surfaces read like product affordances, not internal plumbing.

### Tasks

1. Rename confusing actions.
   - "Search" -> "Browse" when it navigates to `/tools`.
   - In-drawer search stays "Search tools".
   - "Data" -> "Your data" where space allows.
   - "Access" -> "Permissions" or "Connections" after final copy pass.
   - "Save" is the only save/offline primary action.

2. Keep search in context.
   - Drawer search filters the drawer.
   - `/tools` is full browse/catalog.
   - No action should take users to an old launcher/landing surface.
   - Mobile Tools tab opens the drawer, not `/tools`.

3. Fix permission prompt stacking.
   - Permission prompts should not appear under/inside a drawer.
   - Selecting a tool closes the drawer first.
   - Prompt appears as a clear app-context modal after the new app is active.
   - If multiple prompts are queued, show one at a time with understandable copy.

4. Add permission inbox affordance.
   - Pending permission requests can be deferred.
   - Dock shows a small badge.
   - Your Data/Permissions page lists grants and pending asks.

### Acceptance

- Drawer -> select app that triggers permission -> drawer is closed, prompt is readable, app remains full-screen.
- Data/Permissions are understandable labels on mobile.
- Browse never routes to stale launcher UI.

## Phase 6 - Fun, Open Source, And Viral Layer

**Goal:** Dock should feel friendly and shareable without compromising local-first trust.

### Principles

- Gamify shipping and remixing, not surveillance.
- Make achievements local-first and opt-in for sharing.
- Keep private tools private.

### Ideas To Prototype

1. Ship badges.
   - "First tool shipped", "First remix", "Five local tools", "Offline-ready".
   - Shareable image/card, no private app list unless user chooses.

2. Dock streaks.
   - "3 days using your local tools".
   - Quiet, not guilt-based.

3. Remix trails.
   - Public apps can show "remixed from" and "ships inspired by this".
   - Good for open-source virality.

4. Featured docks.
   - Curated public bundles: Kitchen Dock, Fitness Dock, Game Night Dock.
   - Users can add a bundle, then customize locally.

5. Nearby moments.
   - "Share nearby" as an explicit, playful surface for handing a tool to someone in the room.
   - Avoid ambient mystery rooms.

### Acceptance

- None of this blocks launch readiness.
- Prototypes should be opt-in, local-first, and easy to remove.

## Test Matrix

Run every launch-readiness check at least **three times** before deployment.

### Viewports

- Mobile: 390x844
- Tablet: 768x1024
- Desktop: 1440x900

### Tools

- Palate: responsive content app
- Tab: mobilePreferred app
- Golazo or game/canvas app: game sizing/audio lifecycle
- Mise/Chiwit: cross-app permission/intent behavior
- One seeded 1000-app catalog fixture

### Repeated Scenarios

1. Logo -> Dock from active app.
2. Dock -> Resume running app.
3. Drawer open -> scroll -> close.
4. Drawer open -> search -> select app.
5. Drawer open -> select app that triggers permission prompt.
6. Save/remove from card and drawer.
7. Switch away from game/audio app and confirm silence.
8. Close running app and confirm iframe destroyed.
9. Reload and confirm saved/recent/running state is sane.
10. `/workspace`, `/workspace?app=slug`, `/run/slug`, `/tools` route behavior.

## Suggested Implementation Order

### Sprint 1 - User Trust Fixes

1. Dock naming and logo-home route semantics.
2. Running/Saved/Recent Dock home.
3. Mobile Dock/Tools nav contract.
4. Single Save action: Dock + offline.
5. Drawer discoverability, row actions, and save feedback.
6. Permission prompt stacking fix.

This makes the product understandable quickly.

### Sprint 2 - Runtime Safety

1. Background mute lifecycle.
2. Manual close everywhere.
3. Suspend fallback.
4. Game/audio repeated tests.

This removes the most jarring "why is sound still playing?" behavior.

### Sprint 3 - Maker Contract

1. Manifest layout/background fields.
2. SDK host lifecycle/viewport signals.
3. Stage sizing upgrade.
4. Screenshot gates and maker docs.

This prevents the same class of mobile/desktop problems from returning.

### Sprint 4 - Personality And Growth

1. Friendly Dock copy pass.
2. Shareable ship badges.
3. Public bundles / featured docks.
4. Nearby/share refinements.

This makes Shippie feel more fun and open-source without delaying launch readiness.

## Open Copy Decision

Recommendation:

- Use **Dock** as the visible app-home name.
- Use **Shippie Dock** in onboarding/empty-state copy.
- Keep **Tools** for the drawer.
- Use **Browse** for the catalog.
- Use **Save** for "add to Dock and make available offline".
- Use **Your Data** and **Permissions** instead of bare Data/Access where there is room.

Rationale: "Home" is clear but generic. "Dock" is friendlier, fits shipping, fits the OS-app-switcher metaphor, and gives Shippie more personality.
