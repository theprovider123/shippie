# Intelligence Layer & Zero-Config Magic — Roadmap

> **Not an implementation plan.** This is the decomposition document for the third Shippie prompt ("The Intelligence Layer & Zero-Config Magic"). The prompt covers seven independent subsystems; per the writing-plans scope check, each gets its own implementation plan. This document is the master index.

**Date:** 2026-04-25
**Source spec:** Prompt 3 (in conversation)
**Builds on:** v2 plan (`2026-04-25-post-cloud-platform.md`) and its status doc
**Author:** Devante + Claude

---

## Part 1 — Review of HEAD State

Verified by reading source files (not memory). Weeks 1–9 of v2 are shipped in worktree.

### What the prompt assumes already exists — confirmed present

| Prompt section | HEAD location | Test count | Notes |
|---|---|---|---|
| Hidden iframe AI bridge | `packages/sdk/src/local.ts` (`LocalAI`) | 8/8 | postMessage + origin pin + pageshow recovery |
| `ai.shippie.app` PWA | `apps/shippie-ai/` | — | Dashboard, inference router, dedicated worker |
| Origin allowlist | `apps/shippie-ai/src/inference/router.ts` | — | `ALLOWED_ORIGIN_RE` with adversarial coverage |
| Per-app usage log | `apps/shippie-ai/src/dashboard/usage-log.ts` | — | Origin/task/ts/durationMs only — no input text |
| 5 tasks | `inference/models/{classify,embed,sentiment,moderate,vision}.ts` | — | All wired; `vision` opt-in install |
| Model registry | `inference/models/registry.ts` | — | 5 models with size + autoInstall flags |
| DOM observer runtime | `packages/sdk/src/wrapper/observe/` | 12/12 | Registry, mutation observer, capability gate, selector engine |
| Built-in rules | `observe/rules/{wakelock,share-target}.ts` | — | 2 rules only |
| PWA injector | `packages/pwa-injector/src/` | — | manifest, SW, splash, inject-html |
| Feel primitives | `sdk/wrapper/{haptics,spring,view-transitions}.ts` | — | Per-effect, not yet composed into textures |
| Maker zip pipeline | `apps/web/lib/deploy/wrap.ts` + sibling files | — | Wrapped URL flow, KV reconcile, rollback, zip safety |
| CSP rewrite | `apps/web/lib/trust/csp-builder.ts` | — | Adds `frame-src https://ai.shippie.app` |

### What the prompt asks for — gaps

| Prompt section | Status | Where it goes |
|---|---|---|
| WebNN three-tier backend (NPU → GPU → WASM) | **MISSING** — no `device:` param in `inference/models/*.ts`; no `selectBackend()` | Extend `shippie-ai/src/inference/` |
| `source` field in inference response | **MISSING** — `LocalAI.classify()` etc. return `{label, confidence}` with no backend tag | `apps/shippie-ai` + `packages/sdk` |
| AI install prompt in wrapper | **MISSING** — `ShippieAINotInstalledError` exists but no UX flow | `packages/sdk/src/wrapper/` |
| `packages/analyse/` — AppProfile from HTML/CSS/JS scan | **MISSING** | New package |
| PWA injector smart-defaults from AppProfile | **PARTIAL** — manifest gen exists, no AppProfile consumer | Extend `packages/pwa-injector/` |
| Enhance rule compilation from AppProfile | **MISSING** — no `compiler.ts` in observe | `observe/compiler.ts` |
| Wrapper tree-shaking per AppProfile | **MISSING** | `observe/bundler.ts` |
| WASM file detection + COOP/COEP headers | **MISSING** — no .wasm handling in deploy or worker | `packages/analyse` + worker |
| Sensory textures (9 presets) | **MISSING** — only individual primitives exist | `sdk/wrapper/textures/` |
| Texture compiler | **MISSING** | `sdk/wrapper/textures/compiler.ts` |
| Digital patina (wear, warmth, age, milestone) | **MISSING** | `sdk/wrapper/patina/` |
| `packages/intelligence/` — pattern tracker, recall, temporal, spatial, predictive | **MISSING** | New package |
| `packages/ambient/` — background analysis via Periodic Background Sync | **MISSING** | New package |
| Cross-app intents (provider/consumer routing) | **MISSING** | `packages/intelligence/` or worker route |
| Local knowledge graph | **MISSING** | `packages/intelligence/` |
| Maker enhancement dashboard | **MISSING** — exists for app management, not auto-detected enhancements | `apps/web/app/dashboard/` |
| Compliance narrative page | **MISSING** | `apps/web/app/professionals/` |

### Things the prompt got wrong / mismatched against HEAD

- **Prompt says** `ShippieAIBridge` should reuse a singleton iframe and reject if `ready` is false. **HEAD already does this** in `LocalAI` (lazy `ensureIframe`, throws `ShippieAINotInstalledError`). Don't rewrite — extend.
- **Prompt says** `packages/feel/` is its own package. **HEAD has feel as files inside `packages/sdk/src/wrapper/`**. Decision: keep textures + patina co-located with existing feel primitives in `sdk/wrapper/` rather than extract a new package. Saves a `bun.lock` churn and keeps the surface area in one place. (Documented as a deviation from the prompt's literal file layout.)
- **Prompt says** `packages/observe/` for the rule engine. **HEAD has it as `packages/sdk/src/wrapper/observe/`**. Same decision — extend in place.
- **Prompt says** ambient sync uses `BroadcastChannel` to talk to AI iframe across origins. **This is wrong** — `BroadcastChannel` is same-origin. Real solution: SW wakes → posts a queued task to IndexedDB → next time the maker app opens, its `LocalAI` bridge drains the queue and runs analysis. Document the deviation in the ambient plan.
- **Prompt says** Periodic Background Sync is the trigger. **Reality:** PBS is Chrome-only and gated on installed-PWA + engagement. Need a fallback (`visibilitychange` on app open) called out in the ambient plan.

### Pre-existing constraints from prior memory

- 60 dirty files in tree, 0 commits this session — user owns commit decisions.
- Pre-existing rate-route mock-pollution (6 fail in full suite, 0 in isolation). Don't touch.
- `apps/shippie-ai/` deploys as separate Cloudflare Pages project — not the maker zip pipeline. Stack is Cloudflare-only; no Vercel.
- `bun install` needed at root before shippie-ai can `vite dev` (transformers.js + React + vite-plugin-pwa not in current lock).
- All operational claims must be verified against HEAD before being repeated (memory: `feedback_verify_operational_claims.md`).

---

## Part 2 — Scope Decomposition

The prompt covers seven subsystems. Each lands as its own plan + worktree + PR cycle.

| # | Plan | Files (new) | Est. days | Depends on | Ships when… | Acceptance showcase |
|---|---|---|---|---|---|---|
| **A** | **WebNN + Hardware Acceleration** | 4–5 in `apps/shippie-ai/` | 1–2 | — | inference picks NPU when present; `source` field in response | shippie-ai dashboard shows live backend |
| **C** | **Sensory Textures + Patina** | `sdk/wrapper/textures/` (9 presets), `sdk/wrapper/patina/` | 3–4 | — | button tap fires `confirm` texture; install fires `install` texture; 100-day milestone fires `milestone` | Live Room (pub-quiz) — textures power the buzzer + leaderboard |
| **B** | **Zero-Config Pipeline + WASM Support** | `packages/analyse/`, `pwa-injector` ext, `observe/compiler.ts`, worker WASM headers | 5–7 | — | a deployed app with no `shippie.json` gets a manifest + enhance rules from analysis; .wasm app boots with SharedArrayBuffer | Recipe Saver — re-deploy without `shippie.json` and confirm pipeline detects same enhance rules |
| **G** | **Maker Dashboard + Compliance Narrative** | `apps/web/app/dashboard/[app]/enhancements/`, `apps/web/app/professionals/` | 3–4 | B (needs AppProfile) | dashboard shows real auto-detected rules; compliance page live | Recipe Saver dashboard renders the auto-detected rule list |
| **D1** | **Adaptive Intelligence — core** | `packages/intelligence/` (pattern tracker + temporal context + recall) | 4–5 | A | `shippie.local.intelligence.patterns()` returns real data; recall finds a viewed-last-week page by meaning | Journal — "you wrote about X last week" surface |
| **E** | **Ambient Intelligence** | `packages/ambient/` + analysers + insight UI | 5–7 | A, D1 | journal app shows "your mood trended down" insight when user next opens the app | Journal — insight card appears on first open after analysis ran |
| **D2** | **Adaptive Intelligence — experimental** | spatial memory (WiFi BSSID hash) + predictive preload | 3–5 | D1 | `currentSpace()` clusters two distinct WiFi networks correctly; predictive preload shaves transition time | (none — opt-in dashboard tile only) |
| **F** | **Cross-App Intents + Knowledge Graph** | `packages/intelligence/intents.ts`, `knowledge-graph.ts`, worker route, intent declaration in `shippie.json` | 5–7 | A, D1, E | recipe app queries `budget-limit` and budget tracker responds without either knowing the other | DEFERRED — pull when 3+ Shippie apps are installed and users ask for it |

**Total committed:** 21–32 engineering days across 6 plans (A, C, B, G, D1, E). D2 + F are pulled by demand, not pushed.

### Recommended order (revised per 2026-04-25 review)

1. **A — WebNN.** Smallest scope, lowest risk, biggest "wow" for the AI app demo. Unblocks `source` reporting that D1 and E both want.
2. **C — Textures + Patina.** Independent of A. Existing feel primitives (haptics, spring, view-transitions, gestures) are confirmed real, not stubs — Plan C composes them into textures, not polishing them. Live Room is the acceptance test.
3. **B — Zero-Config Pipeline.** Bigger surface but unblocks G and changes the maker story permanently. Recipe Saver re-deploys without `shippie.json` to validate.
4. **G — Maker Dashboard + Compliance.** Ship in immediate sequence with B — the pipeline is invisible without the dashboard. The dashboard is the moment of revelation ("Shippie detected 14 buttons and added haptics to all of them").
5. **D1 — Adaptive Intelligence (core).** Pattern tracker + temporal context + recall. The data spine.
6. **E — Ambient.** Insight surfaces on app open (see Ambient framing note below).
7. **D2 — Adaptive Intelligence (experimental).** Pulled if D1's foundation makes spatial/predictive valuable.
8. **F — Cross-App Intents + Knowledge Graph.** Pulled by user demand. Don't build for a network effect that hasn't arrived.

A and C can run in parallel from the start. **B and G are a paired milestone — they ship together (or G follows B within the same release window). The pipeline's value is invisible without the dashboard showing makers what was auto-detected.** A maker who deploys, sees enhancements they didn't ask for, and has no way to understand or control them is frustrated, not delighted. Treat B+G as one unit even though they're written as two plans. D1 → E serialize. D2 and F are demand-driven follow-ups.

### Showcase app mapping

| Showcase app | Status | Plan it validates |
|---|---|---|
| Recipe Saver | shipped (29 files, 23/23 tests) | **B + G** — re-deploy without `shippie.json`; dashboard renders the auto-detected rules |
| Collaborative Whiteboard | shipped | (existing proximity protocol — no new plan validates it) |
| Journal | shipped (33 files, 30/30 tests) | **D1 + E** — recall + ambient mood-trend insight |
| Live Room (pub-quiz) | NOT YET BUILT — plan written, build deferred | **C** + proximity (already shipped) — buzzer haptic + leaderboard spring physics + textures + mesh |

Live Room is the integration test that proves textures + proximity + observer compose correctly. Its plan is written in parallel with A and C so it's ready, but it does NOT build until A + C + proximity are confirmed working in isolation. Building it earlier would mean debugging platform bugs through the lens of an app — painful and expensive. See `docs/superpowers/plans/2026-04-26-live-room-showcase.md`.

### Ambient framing (explicit user-facing constraint)

`packages/ambient/` runs in the service worker via Periodic Background Sync **when supported**. It is NOT a 3am-while-sleeping process.

The honest UX framing is: **"Your app gets smarter every time you open it."** The flow:

1. SW wakes (PBS fires, OR app comes to foreground via `visibilitychange`).
2. SW writes an analysis-request envelope to IndexedDB and exits.
3. Next time the user opens any Shippie app, the wrapper drains the IndexedDB queue, opens the AI iframe, runs inference, stores insights back to IndexedDB, displays the insight card on the next render.

Plan E's UX copy must reflect this — no claims of overnight analysis. The insight appears on app open. Rolling-summary scenarios ("daily summary at 9pm") only fire if the user opens the app near 9pm.

### What gets deferred

- **WASM tree-shaking of the observer bundle** (prompt step 4 of pipeline). Start with full bundle; add tree-shaking only if real wrapper bundle exceeds 50KB gzip. YAGNI until measured.
- **`navigator.ml` polyfill** — none exists. WebNN-absent devices fall through to WebGPU/WASM and report `source: 'wasm-cpu'`. No emulation.
- **Custom enterprise model deployment** in compliance tier (prompt mentions). Deferred to post-launch.
- **Audio sprite "warm/minimal/playful" palettes** (prompt mentions 3 palettes × ~50KB). Ship one palette ("warm") in plan C; add the other two as a follow-up plan if any maker asks.

---

## Part 3 — Risk Register

| Risk | Mitigation | Plan |
|---|---|---|
| WebNN absent on user's device | Three-tier fallback already specced; report `source` so dashboards can show real backend mix | A |
| AppProfile inference is wrong → bad enhance rules | Confidence threshold per rule; emit `shippie:rule-suggested-low-confidence` event so makers can override | B |
| Periodic Background Sync isn't supported on Safari | Fallback to `visibilitychange` on app open, plus opt-in user-triggered "analyse now" | E |
| Cross-app intent could leak data between apps | Routed through SW with explicit user consent dialog on first cross-app call per provider/consumer pair | F |
| Patina effect is too subtle to notice OR too obvious to look professional | Default sensitivity 0.3; expose configure(); ship A/B switch in dashboard | C |
| Knowledge graph builds wrong inferred relations | Show source attribution on every inferred edge; user can break edges they disagree with | F |
| iOS Safari evicts the AI iframe under memory pressure mid-ambient-analysis | Already handled in `LocalAI` (pageshow recovery); ambient queues in IndexedDB so retry is free | E |
| New analyse package adds 5–10s to every deploy | Run in parallel with the existing build steps; emit AppProfile to KV alongside the wrap meta so reads are cheap | B |
| Existing rate-route test pollution makes CI red on PRs | Document as known-flaky; do not block these plans on it | All |

---

## Part 4 — Success Criteria (composite)

These are the prompt's stated success criteria, mapped to which plan delivers each.

- [ ] Shippie AI app installable and serving inference to all three showcase apps — **already true** (per status doc)
- [ ] WebNN backend active on at least 2 test devices (Pixel, iPhone) — **Plan A**
- [ ] Zero-config pipeline producing correct AppProfile for all three showcase apps — **Plan B**
- [ ] Enhancement dashboard showing auto-detected capabilities accurately — **Plan G**
- [ ] At least one ambient insight surfaced in the Journal app from background analysis — **Plan E**
- [ ] Sensory textures active on all button taps, transitions, and completions across all three apps — **Plan C**
- [ ] Blog post: "How we built a local AI engine shared across PWAs using postMessage" — **Plan G** (writing is user)
- [ ] Compliance narrative page live on shippie.app — **Plan G**

---

## Part 5 — Decision Log (2026-04-25 review)

The user reviewed v1 of this roadmap and locked these adjustments:

- **G moves earlier (4th, after B).** Pipeline without dashboard is invisible to the maker. The dashboard is the moment of revelation. Ship B and G as a paired wave.
- **D splits into D1 + D2.** D1 = pattern tracker + temporal context + recall (4–5 days, immediately useful). D2 = spatial memory + predictive preload (3–5 days, experimental, deferrable).
- **F deferred to demand-pulled.** Cross-app intents only become valuable when users have 3+ Shippie apps installed and explicitly ask for cross-app integration. Don't build infrastructure for a network effect that hasn't arrived.
- **Showcase apps mapped to plans as acceptance tests.** Recipe Saver = B + G acceptance; Live Room = C acceptance; Journal = D1 + E acceptance; Whiteboard = already-shipped proximity validation.
- **Ambient framing locked.** "Your app gets smarter every time you open it" — not a sleeping-overnight claim.
- **Feel layer confirmed real, not stubbed.** Plan C is composition only, no underlying primitive polishing required.
- **Plan A and Plan C approved for full-detail write-up immediately.**

## Part 6 — Plans Written

| Plan | Status | Path |
|---|---|---|
| A — WebNN | **shipped — main branch** (commits bb76eb1 + 8d6b155) | `docs/superpowers/plans/2026-04-26-webnn-hardware-acceleration.md` |
| C — Textures + Patina | **shipped — main branch** | `docs/superpowers/plans/2026-04-26-sensory-textures-and-patina.md` |
| Live Room showcase (acceptance for C) | full plan written; build deferred until C is exercised on real device | `docs/superpowers/plans/2026-04-26-live-room-showcase.md` |
| B — Zero-Config Pipeline + WASM | full plan written; ships paired with G | `docs/superpowers/plans/2026-04-26-zero-config-pipeline-and-wasm.md` |
| G — Maker Dashboard + Compliance | full plan written; ships paired with B | `docs/superpowers/plans/2026-04-26-maker-dashboard-and-compliance.md` |
| D1 — Adaptive Intelligence (core) | not yet written | — |
| E — Ambient Intelligence | not yet written | — |
| D2 — Adaptive Intelligence (experimental) | not yet written; deferrable | — |
| F — Cross-App Intents | deferred (demand-pulled) | — |
