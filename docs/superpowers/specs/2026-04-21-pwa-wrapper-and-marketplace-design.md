# Shippie PWA Wrapper & Marketplace — Install Funnel + Native-Feel Runtime

**Date:** 2026-04-21
**Status:** Draft for review
**Scope:** `shippie.app` (marketplace) + `*.shippie.app` (every maker app) treated as one system.

---

## 1. One-line pitch

> **Deploy your app. We wrap it into an installable PWA and put it in the store.**

Technical promise:

> **Shippie outside — your code runs as-is, we just wrap it.**

Every other platform in this space (Lovable, Bolt, Base) is "Shippie inside" — they want maker code to depend on their runtime. Shippie is the opposite: maker code doesn't know Shippie exists. The wrapper composes around the app via Worker route interception and a single injected `<script async>`.

---

## 2. Goals

- Kill platform-gatekeeping friction on install for every Shippie-deployed app — marketplace and maker apps alike.
- Make an installed Shippie PWA feel indistinguishable from a native app for 95%+ of users (motion, gesture, splash, offline, update, haptics).
- Give makers free distribution, install analytics, feedback, and update infrastructure with zero code changes to their app.
- Keep Shippie a pure wrapper + distribution layer — no BaaS, no cost-center services.

## 3. Non-goals

- No native wrapper (Capacitor / Tauri Mobile). Contradicts the "no app store" thesis and adds build complexity.
- No Shippie-provided auth, database, storage, files, AI, payments, email, SMS, realtime, search. Maker brings all of these or doesn't need them.
- No cross-origin identity flowing into maker apps. Shippie account is a **marketplace** identity only.
- No reselling — no rev share on maker monetization, no metered overage on third-party API calls.

---

## 4. Product surface

### 4.1 Transform (the wrapper)

Every deployed app — marketplace included — gets, automatically, with no maker code change:

- `/__shippie/manifest.json` — PWA manifest, merged with `shippie.json` declarations.
- `/__shippie/sw.js` — platform Service Worker: offline page, update detection, push subscription handling, background-sync for queued wrapper events.
- `/__shippie/icons/*` — 192/512 standard + maskable icons, generated at deploy time from one source icon in `shippie.json`.
- `/__shippie/splash/*` — `apple-touch-startup-image` PNGs for common iPhone/iPad sizes, generated at deploy time and stored in R2.
- `/__shippie/wrapper.js` — injected `<script async>` into every HTML response the Worker serves. This is the runtime that wires up:
  - Smart install banner + IAB bounce sheet + desktop→mobile handoff
  - Update-ready toast
  - Analytics beacon (pageview, web vitals, install-funnel events)
  - Feedback floating button (opt-out in `shippie.json`)
  - View Transitions shim, back-swipe gesture, pull-to-refresh, haptics, per-route `theme-color`, keyboard-aware layout
- `<link rel="manifest">` + apple-touch-icon + splash-image link tags injected into `<head>` if absent.

Maker's HTML is untouched. Their app renders as-is; wrapper composes around it. **Zero visible Shippie branding inside a maker's app** — the wrapper is invisible to end users. Attribution lives in the marketplace, not on the maker's surface.

### 4.2 Distribute (the marketplace)

- Listing at `shippie.app/apps/<slug>`
- Discovery, category shelves, search, editor picks
- Ratings + reviews (Shippie marketplace identity, optional)
- Install attribution (per-install source tracking)
- Referrals / share / deep links (`share_target` in manifest, `?ref=` capture)
- Recommendation engine (co-install graph derived from event spine)
- Leaderboards: trending, newly launched, top rated

### 4.3 Observe (the maker dashboard)

- Installs, DAU/MAU, retention curve
- Web vitals (LCP, CLS, INP) per page
- Feedback inbox with dimensional ratings, duplicate merging, status updates
- Error tracking (uncaught JS errors captured by wrapper)
- Version history, rollback button
- Install funnel breakdown (prompt shown → accepted / dismissed / IAB-detected)

### 4.4 Deliver (delivery pipeline — current state + target state)

**Target state** (design intent, not all shipped yet):
- GitHub App → Vercel Sandbox build → R2 upload → single-write atomic pointer swap (KV `apps:{slug}:active`)
- Custom subdomain `slug.shippie.app` with wildcard SSL (Cloudflare Advanced Cert Manager)
- Preview deploys per PR
- Last 10 versions or 30 days retained for rollback

**Current state at spec time** (what the wrapper plan has to be compatible with, not dependent on):
- GitHub App deploys work; Vercel Sandbox-isolated builds are **gated behind `SHIPPIE_ALLOW_UNSANDBOXED_BUILDS=true`** — prod still runs some builds unsandboxed. Closing that gap is a separate track of work and is **not blocking** the wrapper ship.
- Version finalization currently issues more than one KV write on the hot path — the "atomic pointer swap" is a planned refactor, not a property the current code guarantees. The wrapper plan assumes only that `apps:{slug}:active`, `apps:{slug}:meta`, and `apps:{slug}:pwa` are eventually consistent at the end of a deploy; it does not require them to flip in a single transaction.
- Preview deploys per PR: not yet wired to the subdomain router.
- Rollback works via pointer updates but is not exposed in the dashboard yet.

The wrapper runtime in this spec is deliberately independent of the deploy-pipeline internals — it reads from KV like every other `__shippie/*` route. It builds on the existing `apps:{slug}:active` and `apps:{slug}:meta` keys; a new `apps:{slug}:pwa` key is **introduced by this plan** to carry the enriched manifest overrides and is not part of the current platform. The wrapper assumes only that whatever keys it reads are eventually consistent at the end of a deploy — it does not depend on them flipping in a single transaction. When the sandbox gate is removed and the pointer swap is made atomic, nothing in the wrapper has to change.

---

## 5. Install funnel — detailed mechanics

### 5.1 In-app-browser (IAB) detection + bounce

**Detect** via user-agent sniff on first render: `FBAN|FBAV|Instagram|Twitter|TikTok|LinkedIn|Snapchat|Pinterest|WhatsApp|WeChat|Line`.

**Behavior when detected:** suppress install banner entirely. Show a full-bleed bounce sheet:

- **iOS**: primary CTA calls `window.location.href = 'x-safari-https://' + window.location.href` (works in some IABs). Fallback: "Copy link" (Clipboard API) + illustrated instructions "Tap ⋯ → Open in Safari". Reason copy above button: *"This app lives on your home screen — Safari makes that possible."*
- **Android**: primary CTA uses `intent://${path}#Intent;scheme=https;package=com.android.chrome;end` — works in most Android IABs.

Emit `iab_detected` event on load, `iab_bounced` on CTA click.

### 5.2 Desktop → mobile handoff

When `window.innerWidth > 768 && !('ontouchstart' in window)`, the primary install CTA opens a **Handoff sheet** instead of triggering `beforeinstallprompt`:

- QR code encoding the current URL with `?ref=handoff`
- Email-to-self form (single field, Shippie sends via its own SES/Resend — one-line transactional)
- If the user is signed into Shippie on mobile: "Send to my phone" — fires a Web Push to their installed Shippie with a deep link

### 5.3 Smart install prompt

Replaces the current always-on banner. Uses cookie (anonymous) or Shippie account (signed in) for state:

- **Visit 1**: no banner. Subtle "Install" pill in nav.
- **Visit 2 OR dwell >60s**: soft banner at top, 40px, dismissible.
- **Visit 3 OR meaningful action** (installed an app, deployed, left feedback, rated): full-bleed sheet with 3-step guide.
- Pre-check `getInstalledRelatedApps()` — if already installed, never prompt; show "Open app" button instead.
- Never in `display-mode: standalone`. Never in IAB (shows bounce sheet instead). Never if dismissed in last 14 days.

### 5.4 Native-feel runtime

Delivered by `/__shippie/wrapper.js`:

- **Splash**: per-device `apple-touch-startup-image` links in `<head>`. PNGs pre-rendered at deploy time in R2.
- **Manifest enrichments** (merged with `shippie.json`):
  - `launch_handler: { client_mode: ["navigate-existing"] }` — avoid duplicate windows
  - `share_target` — app receives share intents from other apps
  - `protocol_handlers: [{ protocol: "web+shippie", url: "/open?ref=%s" }]`
  - `display_override: ["standalone", "minimal-ui"]`
  - `id` (stable identity for updates)
  - Maskable icons (Android adaptive)
  - `screenshots` array for richer install UI
- **View Transitions API** wraps route changes (falls back gracefully on Safari <18.2). Named transitions for list→detail (app card icon → app detail hero shares element).
- **Back-swipe gesture**: edge pointer-event detector → peek-to-pop animation. Composes with Next.js router via `history.back()`.
- **Pull-to-refresh**: drag handler on scroll container, calls `router.refresh()` + haptic tick.
- **Keyboard-aware layout**: sets `VirtualKeyboard.overlaysContent = true` where supported; reads `env(keyboard-inset-height)` for layout.
- **Per-route `theme-color`**: `<ThemeColor color="..." />` component updates `<meta name="theme-color">` on mount.
- **Haptics**: `navigator.vibrate(10)` on taps (tabs, buttons, submits); gated on `prefers-reduced-motion`.
- **Skeleton-first**: every data route ships a `loading.tsx` skeleton.
- **Offline**: `/offline` route pre-cached on install, branded. SW uses `sync` for queued analytics/feedback events, `periodicsync` (where available) for update polling.
- **Upgrade toast**: when SW finds new version, a standalone-mode banner prompts "Update ready → Reload".

### 5.5 No visible Shippie branding in maker apps

Deliberate: no "Built on Shippie" badge, no watermark, no corner glyph, no attribution in the maker's app surface. Maker's users don't see Shippie. The wrapper is invisible.

Attribution lives in two places where it belongs:
- The **marketplace** (`shippie.app/apps/<slug>`) — every listing is obviously a Shippie listing.
- The **share-out surface**: when a user shares a maker app, the default OG image template includes a subtle "via shippie.app" footer (maker can override with their own template).

This reinforces the product promise literally: maker code doesn't know Shippie exists, and neither do their end users unless they click through to the marketplace.

---

## 6. SDK surface (tiny, opt-in)

Most makers never need this. For those who want to trigger wrapper UI or emit custom events:

```ts
import { shippie } from '@shippie/sdk';

shippie.track('level_completed', { score });   // custom event → event spine
shippie.feedback.open('bug');                  // open feedback sheet with preset type
shippie.share.open({ title, url });            // Web Share API, OG image generated
shippie.update.check();                        // force SW update check
shippie.referral.capture();                    // read ?ref= and attribute this session
shippie.install.status();                      // { installed, standalone, method }
```

Target size: <5 KB gzipped. Pure wrapper bindings — no network calls except `track` and `feedback`. SDK is optional; all wrapper features (install banner, analytics, feedback button) work without it.

Distributed three ways:
- `npm i @shippie/sdk` (typed, tree-shakable)
- `https://cdn.shippie.app/sdk.js` (global `window.shippie`)
- `/__shippie/sdk.js` same-origin on every maker app (auto-available if maker wants it)

---

## 7. Event spine

One partitioned table for everything the wrapper emits:

```sql
CREATE TABLE app_events (
  id          bigserial PRIMARY KEY,
  app_id      text NOT NULL,
  session_id  text NOT NULL,
  user_id     text,                 -- only populated for marketplace events; null on maker apps
  event_type  text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  ts          timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (ts);
-- Monthly partitions, auto-created.

CREATE INDEX ON app_events (app_id, ts);
CREATE INDEX ON app_events (event_type, ts);
```

**Event types** (closed set, not per-maker-custom except for `custom`):
- `pageview`, `web_vital`
- `install_prompt_shown`, `install_prompt_accepted`, `install_prompt_dismissed`
- `iab_detected`, `iab_bounced`
- `handoff_qr_shown`, `handoff_email_sent`, `handoff_push_sent`
- `update_available`, `update_applied`
- `feedback_submitted`
- `error_captured`
- `referral_captured`
- `share_invoked`
- `custom` (via `shippie.track()`, payload in metadata.name + metadata.props)

**Ingestion**: `POST /__shippie/beacon` with batched events (gzip body). Worker validates app_id, rate-limits, writes to queue → platform consumer → Postgres.

**Derived rollups** (hourly job):
- `usage_daily` — per app × event_type × day (powers maker dashboard)
- `install_funnel_daily` — prompt→accept conversion per app per day
- `user_touch_graph` — marketplace-identity users × apps they interact with (powers recommendations)
- `web_vitals_daily` — p50/p75/p95 LCP/CLS/INP per app per page

---

## 8. `shippie.json` schema (maker-controlled)

```jsonc
{
  "type": "app",                    // app | web_app | website
  "framework": "next",              // autodetected, overridable
  "build": {
    "command": "bun run build",
    "output": "out"
  },
  "pwa": {
    "name": "My App",
    "short_name": "MyApp",
    "description": "...",
    "icon": "./icon.png",           // source icon, platform generates all sizes
    "theme_color": "#E8603C",
    "background_color": "#14120F",
    "display": "standalone",
    "orientation": "portrait",
    "categories": ["productivity"],
    "screenshots": ["./screen-1.png", "./screen-2.png"]
  },
  "wrapper": {
    "install_banner": true,         // opt-out to false
    "feedback_button": true,
    "analytics": true,
    "update_toast": true
  },
  "listing": {
    "show_in_marketplace": true,
    "category": "productivity",
    "tags": ["notes", "ai"]
  },
  "sdk": {
    "events": ["level_completed", "signup"]   // declare custom events for dashboard
  }
}
```

---

## 9. Pricing (clean, no reselling)

### Free forever
- PWA wrapper (manifest, SW, splash, install banner, IAB bounce, offline, updates)
- Subdomain `slug.shippie.app` + SSL
- Marketplace listing + discovery
- Analytics (pageviews, vitals, installs) — 30-day retention
- Feedback inbox — 30-day retention
- **3 apps per account**
- 10 GB bandwidth / mo
- 100 MB static asset bundle per app
- GitHub App deploys + preview PRs

### Pro ($5–10/mo)
- Custom domain
- 90-day analytics/feedback retention
- 100 GB bandwidth / mo
- Unlimited apps
- Priority builds
- Password-protected preview URLs

### Team ($20/seat/mo)
- Multi-maker collaboration with roles
- 365-day retention
- SSO
- Audit log
- 1 TB bandwidth / mo

**Shippie revenue model:** subscription only. No cut of maker revenue, no cost-per-event reselling. Optional future experiment: marketplace attribution fee (1–3% on installs Shippie drove, opt-in for promoted listings).

---

## 10. Architecture

### 10.1 Two planes (unchanged)

- **Control plane** (`shippie.app`, Vercel, Next.js 16): marketing, marketplace, maker dashboard, deploy orchestration, event ingestion backend, billing.
- **Runtime plane** (`*.shippie.app`, Cloudflare Worker): serves maker static files from R2, owns `__shippie/*` routes, injects wrapper script, proxies feedback/analytics to control plane via signed requests.

### 10.2 Wrapper injection

Worker intercepts HTML responses from R2 and rewrites `<head>` + `<body>`:

1. Inject `<link rel="manifest" href="/__shippie/manifest.json">` if not present.
2. Inject apple-touch-icon, splash-image link tags.
3. Inject `<script src="/__shippie/wrapper.js" async></script>` before `</body>`.
4. Inject `<meta name="theme-color" content="...">` if not present.
5. Leave everything else untouched.

Uses `HTMLRewriter` streaming API — zero buffer overhead.

### 10.3 Worker routes (`__shippie/*`)

All reserved same-origin routes, never conflict with maker paths (preflight rejects builds that write to `__shippie/*`):

| Route | Purpose |
|---|---|
| `/__shippie/manifest.json` | Merged PWA manifest |
| `/__shippie/sw.js` | Platform service worker |
| `/__shippie/wrapper.js` | Injected runtime bundle |
| `/__shippie/sdk.js` | Optional SDK bundle |
| `/__shippie/icons/<size>.png` | Generated icons from source |
| `/__shippie/splash/<device>.png` | iOS startup images |
| `/__shippie/beacon` | Analytics ingestion (POST, batched) |
| `/__shippie/feedback` | Feedback submission (POST) |
| `/__shippie/share` | Share-target handler (POST) |
| `/__shippie/open` | Protocol handler deep-link resolver |
| `/__shippie/install` | Install landing + handoff sheet |
| `/__shippie/offline` | Branded offline fallback |
| `/__shippie/meta` | App metadata for wrapper runtime |
| `/__shippie/update` | Version check for update-toast |

### 10.4 Shippie identity scoping

- Sessions live on `shippie.app`.
- Cookies do **not** cross to `*.shippie.app`. Maker apps never see Shippie session.
- Wrapper services that need attribution (feedback, marketplace-user reviews) use short-lived signed tokens passed via query param when user is redirected from `shippie.app` to a maker app.
- `__shippie_session` cookie on maker subdomains is retired — no longer needed since no auth flows into apps.

### 10.5 Build-time asset generation

At deploy time, the build pipeline:

1. Reads `shippie.json`.
2. Generates 192/512 standard + maskable icons from source PNG.
3. Generates apple-touch-startup-image PNGs for 15 common iPhone/iPad sizes.
4. Generates OG image template for share.
5. Uploads all to R2 under `apps/{slug}/v{N}/__shippie/*`.
6. Records asset manifest in KV for Worker to serve.

---

## 11. Rollout phases (~8 weeks)

### Phase 1 — Wrapper foundations (2 weeks)
- PWA Level-1 fixes on `shippie.app`: manifest enrichments, per-route `theme-color`, View Transitions, branded offline, pre-cached routes, splash generation.
- IAB detection + bounce sheet.
- Smart install prompt (engagement-gated, `getInstalledRelatedApps()`).
- Desktop → mobile handoff (QR + email + push-to-phone).
- Worker wrapper infra: HTMLRewriter injection, `__shippie/manifest.json`, `__shippie/sw.js`, `__shippie/icons/*`, `__shippie/splash/*`, `__shippie/wrapper.js`.
- `shippie.json` schema v1 with `pwa` + `wrapper` sections.
- Pipeline: splash + icon generation at deploy time.

### Phase 2 — Native-feel runtime (2 weeks)
- Back-swipe, pull-to-refresh, shared-element transitions, haptics, keyboard-aware, dynamic status-bar.
- SW background-sync for queued events.
- Update-ready toast.
- Push subscription flow (VAPID on platform).

### Phase 3 — Analytics + feedback dashboard (1.5 weeks)
- `app_events` table + monthly partitioning.
- `/__shippie/beacon` ingestion (batch, gzip, queue-backed).
- Hourly rollup jobs.
- Maker dashboard: install funnel, DAU/MAU, vitals, errors, feedback inbox.
- 30-day retention enforcement cron.

### Phase 4 — Marketplace polish + loops (1.5 weeks)
- Install attribution (source tracking from marketplace click → install event).
- Referral capture (`?ref=` + `shippie.referral.capture()`).
- Reviews + ratings (marketplace identity only).
- Co-install recommendations.
- Leaderboards page (trending, new, top-rated).

### Phase 5 — Paid tier + cross-detection (1 week)
- Custom-domain flow.
- Stripe Billing for Shippie's subscriptions.
- `getInstalledRelatedApps()` cross-detection.
- Docs refresh, `/platform` landing page, code-sample polish.

---

## 12. Risks & open questions

**Risks**
- **HTMLRewriter injection breaks some framework HTML quirks.** Mitigation: integration tests against Next, Vite+React, Astro, SvelteKit, plain HTML fixtures; feature flag to disable injection per-app if needed.
- **iOS Safari View Transitions support is recent** (18.2+). Mitigation: feature-detect; fall back to existing fade-up `PageTransition` component.
- **IAB UA sniffing becomes stale.** Mitigation: quarterly review + remote-configurable pattern list served from Worker.
- **Smart-prompt server-side state requires tracking anonymous visitors.** Mitigation: cookie-only, no fingerprinting; covered by existing privacy policy.
- **No maker-app branding means harder organic growth.** Mitigation: lean on marketplace discovery, share-sheet OG template, and word-of-mouth. Re-evaluate if organic install growth stalls at 3-month review — we can reintroduce an opt-in "Powered by" footer for the marketplace listing (not maker surface).

**Open questions** (decide during Phase 1)
- Do we serve a maker's own `/manifest.json` if they ship one, or always override with `__shippie/manifest.json`? Current plan: merge; maker fields win for non-required keys, Shippie fields win for `start_url`, `scope`, `id`, `launch_handler`.
- Where does `share_target` resolve by default on a maker app that hasn't declared a handler? Current plan: `/share?title=…&url=…` query-string redirect to the app's root; maker can override in `shippie.json`.
- How aggressively should we disable wrapper features for `type: "website"` (static-only listings)? Current plan: install banner + analytics on; feedback button + pull-to-refresh + back-swipe off.

---

## 13. Success metrics

- Install conversion rate: prompt shown → install accepted. Target: >8% (industry median ~3%).
- IAB bounce rate: users who hit bounce sheet and end up installing. Target: >25%.
- Handoff usage: desktop visitors who trigger QR/email/push. Target: 15% of desktop visitors.
- Standalone session share: % of sessions in `display-mode: standalone` per app. Target: >40% within 30 days of install banner shipping.
- Web vitals: p75 LCP < 2s across marketplace + top 20 maker apps.
- Feedback submission rate: >0.5% of DAU.

---
