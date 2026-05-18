# Pre-launch plan — 2026-05-18

> Audit consolidated from four parallel persona/infra explorations + live curl probes against worker `e2aa57c8` (deployed 2026-05-18 07:21 UTC). 13/13 routes return 200; deploys are aligned with HEAD; health 94/94. Codex follow-up on 2026-05-18 closed the stale AI deployment blocker and added the AI polish lane below. This document is the punch list to take Shippie from "live and working" to "public-launch ready."
>
> **What this plan is NOT**: it is not a literal visual walkthrough. There's no Playwright/screenshot harness wired yet (set up is one of the items below). Findings are source-level + HTML-structural + flow-logic, not pixel-rendering. **Owner must do a real-phone pass on iPhone Safari + Android Chrome before launch announcement** — that's an explicit blocker tracked below, not something this document can resolve.

---

## 🚨 Blockers — Launch is unsafe without these (3 open + 1 closed)

These are hard gates. Do all four before announcing publicly.

### B1. Google OAuth secrets — `/oauth/google-drive` returns HTTP 503

**Current**: Three required env vars missing on production Pages: `OAUTH_COORDINATOR_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`.

**Impact**: Any user trying backup-to-Drive hits a hard error. Recipe Saver and Journal both wire the Drive backup flow.

**Fix** (≈10 min):
```bash
# 1. Generate the coordinator secret (one-time; save in password manager):
echo "OAUTH_COORDINATOR_SECRET=$(openssl rand -hex 32)"

# 2. Google Cloud Console (https://console.cloud.google.com/apis/credentials):
#    - Create OAuth 2.0 Client ID (Web application, name: "Shippie Coordinator")
#    - Authorized JS Origins:  https://shippie.app
#    - Authorized redirect URI: https://shippie.app/oauth/google-drive  (exactly one)
#    - Enable Google Drive API (APIs & Services → Library)
#    - Add yourself as test user (so app verification not required yet)

# 3. Add the three secrets in Cloudflare dashboard:
#    Pages → shippie-platform → Settings → Environment variables → Production
```

Verification after add: `curl -sI https://shippie.app/oauth/google-drive` should return 302 (to Google authorize), not 503.

### B2. AI runtime deployed + ambient bridge wired — CLOSED 2026-05-18

**Current**: `ai.shippie.app` is live as its own Cloudflare Worker/PWA, and the platform container now lazily starts the real local AI Web Worker on first `shippie.ai.run()` instead of holding the old placeholder client.

**Product decision**: `ai.run` is an ambient device-local capability. Apps can only submit data they already have; inference runs in the container's local model worker; unsupported devices return `{ source: 'unavailable' }` so features hide cleanly. No per-app popup, no permission ceremony, no broken AI surface.

**Verification**:
- `curl -sI https://ai.shippie.app/` returns 200.
- Existing and newly deployed container apps can call `shippie.ai.run()` without declaring `localAi.tasks`.
- SDK calls resolve to `{ source: 'unavailable' }` instead of throwing if the bridge/device cannot serve the task.

**Remaining risk**: real-phone B3 still needs a cold-start AI smoke on low-end Android and iPhone Safari to measure first model setup latency.

### B3. Real-phone smoke per `docs/launch/real-phone-checklist.md` not done

**Current**: No evidence of a two-phone Live Room test, no Recipe offline persistence verification, no end-to-end Drive backup test on a real device.

**Impact**: Every "feels like a real app" claim is untested. Unknowns: PWA install on iOS Safari (the 7-day eviction story), wake-lock behaviour, haptics, mesh pairing across the buzzer fairness test, AI runtime cold-start on a low-end Android.

**Fix** (≈3-4 hours of real human time on two phones):
- iPhone Safari + Android Chrome
- Install Recipe, Journal, Live Room, Lift, Mevrouw to home screen on both
- Live Room: host on A, join on B via QR, run a 3-question quiz, measure D1 `room_audit` latency (target: <30ms median)
- Recipe: add 5 recipes, airplane-mode, relaunch from home screen, confirm persistence
- Journal: complete one Drive backup round-trip (requires B1 done first)
- Photograph each PWA on the home screen for launch assets

This **cannot** be automated. Block on it.

### B4. `SHIPPIE_PUBLIC_HOST` missing from Pages env

**Current**: Code reads it via `env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app'` — falls back to hardcoded string when missing. Currently works because the hardcode matches, but masks misconfiguration if zone ever moves.

**Fix** (≈2 min):
```
Pages → shippie-platform → Settings → Environment variables → Production:
  SHIPPIE_PUBLIC_HOST = shippie.app   (plaintext, not secret)
```

---

## ⚠ High — Must be done before public announcement (11 items)

### H1. Cron jobs unverified live

**Current**: `*/5 * * * *` (reconcile-kv), `0 * * * *` (reapTrials + rollups), `0 4 * * *` (retention + capability_badges + kind rollup + ops maintenance) all wired in `wrangler.toml`. All handlers have tests. None proven to fire and complete on prod data.

**Fix** (≈15 min + wait): trigger the 4am cron via Cloudflare dashboard ("Run for me"), then:
```bash
cd apps/platform
bunx wrangler d1 execute shippie-platform-d1 --remote --command \
  "SELECT app_id, badge, awarded_at FROM capability_badges ORDER BY awarded_at DESC LIMIT 5;"
```

### H2. SignalRoom DO never live-tested across two devices

**Current**: Durable Object exists at `apps/platform/src/lib/server/proximity/signal-room.ts`, wrangler v3 migration registers it, `/__shippie/signal/[roomId]` returns HTTP 400 on bad input (good — DO responding). But no real two-phone trial.

**Fix**: Covered by B3. Specifically: Live Room phase of the real-phone checklist.

### H3. Dashboard sub-route navigation hides 5 of 8 maker pages

**Current**: `apps/platform/src/routes/dashboard/apps/[slug]/+layout.svelte:16–20` exposes only **Overview / Access / Analytics** in the tab nav. The five orphan pages — `profile`, `enhancements`, `localize`, `proof`, `deploys/[deployId]` — are reachable only via direct URL or inline links from Overview. A maker landing in `/profile` or `/proof` has no back-link.

**Impact**: Pre-launch with 1–5 early makers this works. By user 20–50, "I can't find my analytics → I can't find my proof badges" becomes a frequent question.

**Fix** (≈30 min):
- Expand tabs to all 8 (or pick the 5 that should be canonical and demote the rest)
- Add breadcrumb at top of `profile/+page.svelte:10` and `proof/+page.svelte`
- See `2026-05-17-platform-mobile-audit.md` PR4 (renamed from old PR3) for the full dashboard shell migration

### H4. Mobile dashboard rail stacks above content

**Current**: `dashboard/+layout.svelte:18` is `grid-template-columns: 240px 1fr` collapsing to `1fr` at `@media (max-width: 720px)`. Sidebar then stacks ABOVE main content. Sidebar has `min-height: 100dvh` so on short screens it eats the viewport.

**Impact**: Maker checks an app on their phone after a CLI deploy → sees rail-only on first screen, has to scroll past it to reach the dashboard.

**Fix**: PR4 of `2026-05-17-platform-mobile-audit.md` (re-sequenced). Convert rail to a collapsible drawer ≤640px, or relocate as bottom tabs. Same fix shape as `/admin/+layout.svelte:95` and `/container/+page.svelte:3399`.

### H5. Trust message never seen by focused-mode-only users

**Current**: `/run/[slug]/` → 308 → `/container?app=<slug>&focused=1` skips the dashboard / sidebar entirely. The "your data stays on this device" promise lives at:
- `container/+page.svelte:2864` (sidebar — never rendered in focused mode)
- `your-data/YourDataTab.svelte:94` (Your Data tab — requires user to exit focused mode)

A user who installs Recipe → uses it for 5 minutes → closes has never read the privacy contract that Shippie's marketing promises.

**Fix** (≈30 min): one of:
- One-time toast on first focused-mode load: "Shippie tools run on your device. Your data stays here."
- Persistent micro-banner above the app frame on first session, dismissable
- Onboarding sheet during install (not after)

### H6. "Create" tab in container is mislabeled

**Current**: `container/+page.svelte:2878` "Create" tab renders Collections + Deploy + Import. A user in Recipe Saver who thinks "I want to create a recipe" taps Create → sees deploy options → confusion.

**Fix** (≈5 min): rename to "Add tools" or "Explore" or "Tools" (matches intent). Single string change.

### H7. Per-route OG metadata missing on `/why`, `/docs`, `/professionals`, `/build`

**Current**: All four routes fall back to root-level OG tags ("Shippie — Ship local." + "Open marketplace…"). Sharing `/why` on social shows the generic preview, not the page's actual value prop.

**Fix** (≈20 min): add `<svelte:head>` blocks to each route with page-specific `og:title`, `og:description`, `og:image`. Apex `og-image.png` exists at `/og-image.png` (HTTP 200). Either use it as fallback or render per-route variants via Playwright (already used to generate apex og — see 2026-04-29 session log).

### H8. `/build` and `/why` 301-redirect to `/docs/*`

**Current**: `apps/platform/src/routes/build/+server.ts:6` and `routes/why/+page.server.ts:5` redirect to `/docs/build` and `/docs/why`. Marketing copy linking to `/build` and `/why` (e.g., apex CTAs) incurs an extra round-trip; URLs are not stable for share.

**Fix** (≈15 min): host the builder onboarding directly at `/build` (no redirect) and move reference docs to `/docs/reference`. Removes the redirect noise.

### H9. App-detail back-link points to defunct `/apps`

**Current**: `apps/platform/src/routes/apps/[slug]/+page.svelte:117` `<a href="/apps">All tools</a>`. `/apps` is 301'd to `/` (per homepage-as-launcher pattern, 2026-05-08). User sees a perceptible redirect bounce.

**Fix** (≈1 min): change `href="/apps"` to `href="/"`. Single line.

### H10. `robots.txt` and `sitemap.xml` both 404

**Current**: `curl -sI https://shippie.app/robots.txt` and `/sitemap.xml` both return 404.

**Impact**: Search engines have no policy hint and no URL list. Indexability suffers on launch day. Combined with H7, social + search sharing both look worse than they should.

**Fix** (≈45 min):
1. Add a SvelteKit endpoint at `apps/platform/src/routes/robots.txt/+server.ts` returning `User-agent: *\nAllow: /\nSitemap: https://shippie.app/sitemap.xml\n` plus disallow for `/admin/*`, `/dashboard/*`, `/trust-preview`.
2. Add `routes/sitemap.xml/+server.ts` generating the URL list from `route-inventory.json` (filter to `priority=P0|P1` and shell ∈ `{public, showcase-wrapper}`).
3. Reference both in `docs/launch/cf-google-deploy.md`.

### H11. Invisible AI polish lane

**Current**: Shippie has the right AI primitives, but the launch surface should make AI feel automatic rather than like a separate product users must understand. The bridge should never throw visible AI setup errors, app features should quietly appear when the model is available, and newly added apps should get the same local AI path by default.

**Landed 2026-05-18**:
- `shippie.ai.run()` is now ambient for iframe apps; no per-app popup or manifest ceremony is required for local-only inference.
- The container lazily spawns the real AI worker on first use, sharing model downloads/cache across every app in the session.
- The iframe SDK resolves failed/denied AI calls to `{ source: 'unavailable' }` so apps can hide optional AI affordances instead of surfacing errors.
- The AI dashboard reset flow uses inline two-tap confirmation instead of a native browser popup.

**Next polish**:
- Add a tiny non-blocking model warm path after first app launch on WiFi/charging where supported. Do not block the app frame.
- Add a dashboard-visible "Local Intelligence" row summarising backend + model cache without asking the user to configure anything.
- Make `summarise`, `translate`, and `generate` explicit "edge-required" tasks with consent-gated fallback, not silent cloud calls.
- Add a real-phone cold-start measurement to B3: first classify call, second classify call, and offline repeat.

---

## 🔧 Medium — Soft-launch / first-week polish (14 items)

### M1. Security headers missing on all platform responses

**Current**: No `Strict-Transport-Security`, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Content-Security-Policy`, no `Referrer-Policy`, no `Permissions-Policy`.

**Impact**: Not a launch blocker (Cloudflare zone defaults soften some risks), but bad optics for "your data stays on device" platform. The plan calls for a persisted CSP — see `apps/platform/src/lib/server/...` for current state.

**Fix** (≈1-2 hours): add a SvelteKit `hooks.server.ts` response transformer that sets:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), interest-cohort=()`
- `Content-Security-Policy:` — needs careful design given Fraunces/Inter from fonts.googleapis.com, esm proxy at `/__esm/*`, showcase iframes, etc.

### M2. Mobile-audit token report has 11 input-zoom hazards

From `apps/platform/scripts/mobile-audit/tokens-report.md` (generated this session):
- `auth/login/+page.svelte:130` — `font-size: 15px` on `input[type='email']` — **iOS focus-zooms during sign-in**
- `dashboard/apps/[slug]/+page.svelte:221` — `font-size: 12px` on `.actions textarea`
- `new/wrap-form.svelte:110` — `font-size: 14px` on `input, select` (deploy wizard)
- `admin/+page.svelte:99`, `admin/audit/+page.svelte:140` — 13px on admin selects
- Others are admin-internal, lower priority

**Fix**: bump each to `var(--type-body-mobile)` (16px) — token now exists.

### M3. Mobile-audit static-rules report has 23 breakpoint drifts + 24 tap-target violations

From `apps/platform/scripts/mobile-audit/static-rules-report.md`:
- Non-canonical breakpoints in active use: 480, 520, 560, 680, 700, 720, 760, 768, 820, 860, 900, 980, 1100, 1440 (canonical: shell={640, 1024}, density={1280, 1536, 1920})
- Tap targets <44px: Nav avatar (32×32), Nav toggle (36×36), AppInspector close (32×32), LauncherCard quick-actions (34×34), focused-chrome buttons (40-42×42)

**Fix**: bake into the platform-mobile-audit PR sequence (PR2-PR6 per the re-sequenced plan). Nav avatar/toggle/close are quick wins for PR1c.

### M4. `docs/` is a stub

**Current**: `routes/docs/+page.svelte:3-4, 147` explicitly says "2-3 paragraphs, polish in a follow-up" and "The SDK reference moves here in a follow-up." First-time builders expecting comprehensive docs see truncated blurbs.

**Fix** (decision required):
- (A) Ship 5-10 finished sections (deploy, CLI, MCP, capabilities, proof, intents, AI runtime, data-safety, runtime, container) — ≈4 hours of writing
- (B) Rename to "Docs (in progress)" + "Coming soon for X sections" — ≈30 min, resets expectations honestly

### M5. Launch video assets missing

**Per `docs/launch/launch-sequence.md`**: Day 1 needs 4 video clips:
- 2-minute master demo (wrapping + intent flow + offline proof)
- 60-sec Live Room buzzer fairness
- 60-sec container switching + Your Data
- 15-sec deploy-in-60-seconds CLI clip

**Current state**: `docs/launch/recordings/c2-cross-cluster.webm` is a "37-second desktop-Chromium rough cut" — not production quality.

**Fix** (≈2 hours with phone + laptop): record on real devices once B3 (real-phone smoke) is complete. Decide: ship without on Day 1 vs delay Day 1 by a few days.

### M6. Whitepaper exists only as markdown

**Current**: `docs/WHITEPAPER.md` is 15KB markdown. `/whitepaper` route exists (`routes/whitepaper/+page.svelte`) but unverified if it renders the markdown or is its own page.

**Fix** (≈30 min): confirm `/whitepaper` renders the doc with reasonable typography. If not, wire `marked` to render it server-side.

### M7. Stale docs not marked archived

**Per CURRENT_STATE.md**: `docs/architecture.md`, `docs/self-hosting.md`, `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`, `docs/shippie-refactoring-plan-v5.md` all reference deleted pre-cutover architecture. Stale.

**Fix** (≈10 min): add a deprecation banner at top of each:
```markdown
> **ARCHIVED (pre-2026-04-26 SvelteKit+Cloudflare cutover).**
> For current state see `docs/CURRENT_STATE.md`.
> For current deployment see `docs/launch/cf-google-deploy.md`.
```

### M8. CURRENT_STATE.md last-updated stamp says 2026-04-29

Stale by 19 days. Significant work since: PR #4 (private spaces / showcase slate, 64 commits), PR #13 (mobile-audit PR0 + Phases 1-7 + Your Data redesign + SDK bottom-sheet), the deploy itself.

**Fix** (≈30 min): rewrite the bottom of the file to cover what's landed since 2026-04-29. Don't try to make it perfect — incremental updates are the pattern.

### M9. Deploy error states lack remediation links

**Current**: `apps/platform/src/routes/new/upload-form.svelte:284–298` renders deploy blockers (rules, titles, details) but doesn't link to docs or suggest remediation.

**Fix** (≈20 min): append "Learn more" link to each blocker detail or surface a general "Why did this fail?" FAQ link below the error list.

### M10. `<pre><code>` deploy snippets have no copy button

**Current**: `apps/platform/src/routes/new/+page.svelte:166-183` has three command snippets (CLI, MCP, GitHub) as `<pre><code>` blocks. No copy-to-clipboard button.

**Fix** (≈15 min): add a copy button per snippet. Small UX win that reads as polished.

### M11. Focused-mode exit pill is 0.42 opacity

**Current**: `container/+page.svelte:3540-3581` chrome buttons (mark and tools-drawer) at low opacity. First-run hint fires at line 2402 but only once.

**Fix** (≈20 min): increase to 0.6 baseline; add a tap-to-reveal tooltip on the left mark after 8s of focused-mode inactivity if not yet interacted with.

### M12. Your Data lands on Devices, not Tools

**Current**: `YourDataTab.svelte` defaults to Devices pane (recovery/mesh). User who entered Your Data to ask "what data does Recipe store?" is sent to a recovery flow they don't need.

**Fix** (≈10 min): land first-time visitors on `ToolsPane` (detect via sessionStorage); landing on the user's last-viewed pane on return.

### M13. Trust-preview route exposed without auth

**Current**: `/trust-preview` is an internal staging surface. Has `<meta name="robots" content="noindex,nofollow">` so search engines respect it, but the URL is linkable. Anyone can view.

**Fix** (≈5 min): gate behind auth + admin role, or feature-flag it off in production.

### M14. Showcase slug smoke incomplete

**Current**: 62 showcases under `apps/showcase-*` baked into the worker at deploy. No automated test that all 62 `/run/<slug>/` URLs load.

**Fix** (≈10 min — extend existing harness): add `apps/platform/scripts/mobile-audit/showcase-smoke.mjs` that curls `/run/<slug>/` for every showcase and reports non-200.

---

## ✨ Polish — Post-launch backlog (12 items)

### P1. Trim app-detail sub-routes from 8 to 5
Merge `enhancements` into `profile` (both edit app metadata). Move `deploys` to a collapsible section on Overview. Defer `localize` to a docs-first flow. Keep Overview, Access, Analytics, Proof, Profile.

### P2. Unify error rendering between `upload-form.svelte` and `wrap-form.svelte`
Both handle `.kind === 'error'` differently. Single shared `<ErrorCard>` component.

### P3. Add subtle "Get help" footer under `/dashboard`
Links to docs, bug report, feedback page. Currently `/dashboard/feedback` is sidebar-only.

### P4. Warm up empty-state copy
"Seeded 5 example recipes — swipe to delete any of them." → "We added 5 examples. Try swiping to delete one, or edit any."

### P5. Add iframe boot-time skeleton
Currently focused-chrome buttons appear immediately but app frame can take 2-3s on slow networks. Skeleton during `frameStates[appId] === 'booting'`.

### P6. Inline help on Devices + Backup panes
Dense UI; small info icons next to section headers opening micro-modals with 2-3 sentences of context.

### P7. PWA installed-mode one-time toast
"Shippie is installed. Works offline." — first run in standalone mode only.

### P8. Drop Access pane from main Your Data nav
It's advanced (observation flows / private spaces). Collapse under a gear icon or under Devices.

### P9. Merge Devices + Backup into "Recovery"
Most users don't care about the distinction.

### P10. Add small Shippie mark inside showcase chrome
A 16-20px badge top-left, inside safe-area, linking back to `/`. Cross-app cohesion: a Recipe user knows they can tap once to Journal.

### P11. `prepare-showcases.mjs` orphan cleanup
Add a cleanup phase that diffs `apps/showcase-*/` against `static/run/*/` and warns on (or deletes) orphans. Recurring lesson from 2026-05-05.

### P12. GitHub integration secret audit
Eight GitHub secrets deployed but undocumented (`ADMIN_EVENT_HASH_SECRET`, `GITHUB_PLATFORM_INSTALLATION_ID`, `SHIPPIE_OWNER_EMAIL` all unclear). Document or remove.

---

## Sequencing

### Pre-launch day-of (≤6 hours of focused work)

1. **B1** Google OAuth secrets — 10 min — (you, Cloudflare + Google Console)
2. **B4** `SHIPPIE_PUBLIC_HOST` env — 2 min — (you, Cloudflare dashboard)
3. **H6** Rename Create tab → "Add tools" — 5 min — (Claude)
4. **H9** Fix app-detail back-link — 1 min — (Claude)
5. **M11** Bump focused-mode pill opacity — 10 min — (Claude)
6. **H10** Add robots.txt + sitemap.xml — 45 min — (Claude)
7. **H7** Per-route OG metadata — 20 min — (Claude)
8. **H11** AI cold-start smoke + no-popup verification — 15 min local + B3 phone pass — (Claude + you)
9. **M7** Mark stale docs archived — 10 min — (Claude)
10. **B3** Real-phone smoke — 3-4 hours — (you, with two phones)
11. **H1** Verify cron firing — 15 min + 24h wait — (you)
12. **H2** Live Room two-phone test — covered by B3

### Pre-announcement (rolling, after Day 1 prep)

- **H3 + H4 + M3** — dashboard shell migration (the platform-mobile-audit plan's PR3/PR4)
- **H5** — trust banner in focused-mode
- **H8** — drop `/build` and `/why` redirects
- **M2** — input-zoom fixes across 9 files
- **M5** — record launch videos
- **M9 + M10** — error state remediation links + copy buttons
- **M12** — Your Data lands on Tools

### Post-launch backlog (P1-P12)

Cherry-pick by user feedback frequency. None are launch-blocking.

---

## What this plan can't see

Things I cannot verify from source + curl, that need a real human + browser:

- **Pixel-level layout breaks**: I read `<style>` blocks and grep for known anti-patterns, but cannot see a sidebar visually pushing content off-screen at 390px.
- **Font load failures**: Fraunces + Inter via Google Fonts — if Google blocks our origin in the user's network, the fallback chain looks different.
- **iOS Safari ITP eviction**: the 7-day rule was flagged on 2026-05-09. We tested the mitigation (install-nudge + Drive backup) but never observed the actual 7-day eviction on a real device.
- **PWA install prompts**: do iPhone Safari and Android Chrome show the install affordance the moment they should?
- **Wake locks, haptics, permissions**: showcase Lift and Mevrouw both depend on these. Tested in dev but unverified on the deployed worker.
- **Cross-origin signed-request flow**: showcases at `*.shippie.app` calling `/__shippie/sdk.js` work in dev; verify on first install.
- **Real network latency**: Live Room target is <30ms remote stroke. Stated, unverified on prod CF latency.

**Recommendation**: before public announcement, set up a Playwright screenshot-matrix script at `apps/platform/scripts/mobile-audit/screenshot-matrix.mjs` that captures every route at 360/390/430/768/1024 px against prod. Two hours of work; permanent value. The visual-walkthrough this plan can't do, that script makes routine.

---

## Decision points (block work below until resolved)

1. **Day 1 video assets**: ship without on launch day, or delay launch by a few days to record them?
2. **Docs stub**: ship 5-10 finished sections (4 hours of writing) or relabel as "Docs (in progress)" (30 min)?
3. **Dashboard sub-route shape**: keep 8 tabs and add nav (H3 fix as listed), or trim to 5 per P1?
4. **Security headers**: ship default-minimal (HSTS only) for Day 1 and harden CSP post-launch, or block on full CSP design?

---

## Snapshot — current prod state for the record

- **Worker**: `e2aa57c8-4c8d-4868-8310-4996713b158b` (deployed 2026-05-18 07:21 UTC)
- **Health**: 94/94 tasks pass (67 cached)
- **Routes**: 13/13 prod smoke 200; 38 routes documented in `mobile-audit/route-inventory.json`
- **Showcases**: 62 first-party at `apps/showcase-*`
- **Crons**: 3 attached (`*/5 * * * *`, `0 * * * *`, `0 4 * * *`)
- **Bindings**: D1 + 3 R2 buckets + KV + DO `SignalRoom` + Email + 24 env vars
- **Secrets deployed**: 10 (AUTH, WORKER_PLATFORM, GitHub ×6, ADMIN_EVENT_HASH, SHIPPIE_OWNER_EMAIL)
- **Secrets missing**: 3 (OAUTH_COORDINATOR, GOOGLE_DRIVE_CLIENT_{ID,SECRET}) — B1
- **DNS**: `shippie.app` + `*.shippie.app` both resolve via CF to Pages backend
- **Static**: og-image.png ✓, manifest ✓, all icons ✓, **robots.txt + sitemap.xml ✗**
