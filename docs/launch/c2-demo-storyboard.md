# C2 Launch Demo — 2-minute storyboard

The 2-minute screen recording is the C2 final deliverable per the approved plan. Cut once all 8 showcase apps + the cross-cluster intent wiring land.

**Target length:** 110–120 seconds. **Pace:** 8–10 beats. **Setting:** simulated day. **Audio:** ambient under-the-shot only — no voiceover. **Captions:** white sans on black bar, 18px equivalent.

## Beat sheet

| # | Time | Cluster | App(s) on screen | What happens | Caption |
|---|---|---|---|---|---|
| 1 | 0:00–0:08 | — | Container Home | Zoom in on the Shippie container. Three apps already installed in the Food cluster, three in the Health cluster. | "One Shippie. Many apps. All your data, on this device." |
| 2 | 0:08–0:18 | Food | **Recipe Saver** | User saves a recipe — autosuggest tags from local vision-AI on the photo. | "Local AI tags the photo — never leaves your device." |
| 3 | 0:18–0:28 | Food | **Pantry Scanner** | User scans a barcode. Product recognition resolves on-device. | "Camera + on-device vision = no upload, no account." |
| 4 | 0:28–0:42 | Food → Food | **Meal Planner** | Container Home: insight strip surfaces "Plan meals from your new recipe". User taps → opens Meal Planner pre-filled. Permission prompt: "Meal Planner wants to read shopping-list from Recipe Saver." | "Apps talk to each other — only when you say yes." |
| 5 | 0:42–0:55 | Food | **Shopping List** | User opens shopping list, sees items pulled from meal plan. Mesh badge: "📡 1 nearby". Partner's phone joins room. List syncs in real time. | "Local mesh — no servers, no cloud, just the room." |
| 6 | 0:55–1:08 | Health | **Workout Logger** + **Sleep Logger** | User logs a workout. Sleep Logger auto-correlates: "You slept 18% better the night after high-intensity sessions." | "Cross-app correlation, computed locally." |
| 7 | 1:08–1:25 | Food → Health | **Recipe Saver → Habit Tracker** | User cooks a recipe. Habit Tracker (Health cluster) auto-checks "cooked-dinner" habit. Highlight the cross-cluster intent line — different colors, same flow. | "Cross-cluster intents — the ecosystem compounds." |
| 8 | 1:25–1:35 | — | Your Data overlay | User taps Your Data on the topbar. Storage breakdown by app. Encrypted backup button. | "Your data. Encrypted backup. Or delete it all." |
| 9 | 1:35–1:50 | — | Settings | Quick scroll past install banner — "Add to Home Screen" → fullscreen launch. | "It's a website. It installs like an app. It runs offline." |
| 10 | 1:50–2:00 | — | Title card | Logo, tagline, URL. | "shippie.app" |

## Hard requirements

- Real device(s), real iPhone Safari + Android Chrome. No simulators.
- Capture both phones for beat 5 (mesh) — split-screen is fine.
- Beat 4 + beat 7 MUST show the actual permission prompt + intent flow. No fake UI.
- All 8 apps run from the same `/container` shell — no app-store install screens, no separate domains.
- Cut without bg music so the cross-app affordances breathe.

## Pre-record checklist (technical)

- [ ] All 8 showcase apps deploy cleanly (`bun run health` green) and are reachable from `/container`.
- [ ] Cross-cluster acceptance test (`apps/platform/src/lib/container/cross-cluster-intent.test.ts`) passes.
- [ ] AppProfile zero-config produces the expected category for every showcase (`packages/analyse` smoke).
- [ ] Intent permission UI renders with current branding (no `Phase A2` debug labels).
- [ ] Mesh status badge reaches "📡 N nearby" on real WebRTC, not the stub.
- [ ] Insight strip places, animates, and dismisses correctly on real iOS Safari.
- [ ] Your Data overlay opens via topbar AND via in-iframe `data.openPanel` call.
- [ ] No analytics, no error tracker, no third-party fonts in the recorded session.

## Distribution

- Hero loop (8s, muted, autoplay) on `shippie.app` homepage — beat 4 by itself.
- Full 2-min cut on landing page modal + Twitter/X (split into two 60s clips if the platform requires it).
- Hacker News submission goes up on the same hour as the homepage swap.
- Internal copy of the recording committed to `docs/launch/recordings/c2-2min-launch.mp4` (LFS).

## Storyboard ownership

Solo eng cuts the recording. No external editor; we want the recording to feel like a real device session, not a marketing reel.
