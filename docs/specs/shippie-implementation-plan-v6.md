# Shippie — Master Implementation Plan (v6)

**Version 6 consolidates v5 + v5.1 Patch 3 + v5.1.1 A–E + v5.1.2 F–G + v5.1.3 J–M + v5.1.4 N–P + v5.1.5 Q–S + v5.1.6 T into a single coherent build-from-scratch specification. This document is the definitive source of truth.**

---

## Part 1 — Vision, Positioning, and Invariants

### 1.1 What Shippie Is

Shippie is the shipping system. It turns code into launched, installed, used, iterated-on software. Not a deploy platform, not a marketplace — a complete pipeline that closes the gap between "I built a thing last night" and:

1. **This morning**: people have it on their phone (web + PWA install)
2. **This week**: it's on Google Play (Android automated)
3. **This month**: it's ready for App Store submission (iOS Prep Kit)

Shippie is three products in one:
- **A deploy platform** — push code, get a live app at `{slug}.shippie.app` in under a minute
- **A discovery marketplace** — users browse, search, and install apps
- **A feedback engine** — users tell makers what's working, makers iterate and redeploy in minutes

### 1.2 The Core Invariant

> **Every project deployed on Shippie becomes a Shippie-managed runtime on its own origin, with reserved same-origin system routes under `__shippie/*` for auth, storage, feedback, analytics, install UX, functions, and app metadata.**

- `shippie.app` is the **control plane** (Next.js on Vercel)
- `*.shippie.app` is the **runtime plane** (Cloudflare Workers + R2 + reserved routes)
- The Worker owns `__shippie/*` on every app origin
- SDK calls are same-origin — no CORS, no cross-origin token juggling
- Sessions are app-origin httpOnly cookies holding opaque handles backed by server-side rows
- The Worker is the trust boundary between maker code and the platform

### 1.3 The Three Ships

Every `app`-type project serves three distribution channels from one codebase:

```
Ship to Web     → {slug}.shippie.app      always on, from day 1
Ship to Phone   → PWA install              on by default for type=app
Ship to Stores  → Play Store + App Store   opt-in, gated by Native Readiness Score ≥85
```

Same shippie.app dashboard controls all three. One codebase. One version lifecycle. One feedback loop.

### 1.4 Positioning

| Product | What it does |
|---------|--------------|
| **Vercel** | Helps code go live |
| **App Store** | Distributes finished native apps |
| **Shippie** | Turns code into launched, installed, used, iterated software — and gets it store-ready along the way |

Shippie is not competing with Vercel (they're a backend primitive Shippie uses). Shippie is not competing with the App Store (Shippie is the funnel into it). Shippie is the shipping layer between code and distribution.

The moat is the integrated loop, end-to-end, for vibe-coded apps:

> repo → live origin → phone install → feedback → iteration → store-ready → submitted → launched

---

## Part 2 — Architecture

### 2.1 Two Planes

**Control plane — `shippie.app` (Next.js 16 on Vercel)**
- Marketing, storefront, discovery, leaderboards
- Maker sign-in, dashboard, deploy UI
- OAuth 2.0 authorization server (`/oauth/authorize`, `/api/oauth/token`)
- Platform internal API (`/api/internal/*`) — only reachable via signed requests from the Worker
- GitHub App webhook receivers
- Build orchestration (Vercel Sandbox for npm builds)
- Cloudflare Workers for Platforms (CFW4P) dispatcher for Shippie Functions
- Admin + moderation surfaces

**Runtime plane — `*.shippie.app` (Cloudflare Worker + R2)**
- Serves maker files from R2 via an atomic version pointer
- Owns `__shippie/*` system routes (sdk, session, storage, feedback, analytics, install, manifest, sw, fn, meta, health)
- Sets and reads opaque app-origin session cookies
- Proxies storage/feedback/analytics calls to the platform API with signed requests
- Runtime PWA injection via HTMLRewriter as a fallback
- Version pointer swap = atomic deploy + instant rollback

### 2.2 Stack Summary

| Layer | Tool | Why |
|-------|------|-----|
| Platform app | Next.js 16 on Vercel | Fast iteration, preview deploys, zero ops |
| API routes | Next.js Route Handlers on Vercel | Same deployment as web, shared auth |
| Database | PostgreSQL 16 on Hetzner VPS | Full control, RLS, FTS, jsonb |
| DB network | Cloudflare Tunnel (Vercel → Hetzner) | No public Postgres exposure |
| Connection pool | PgBouncer on Hetzner | Prevents Vercel function connection exhaustion |
| ORM | Drizzle + `@auth/drizzle-adapter` | Type-safe, works with Auth.js |
| Auth | Auth.js v6 with GitHub + Google + Apple | OAuth 2.0 server for apps via authorization code + PKCE |
| Static app hosting | Cloudflare R2 + Workers wildcard routes | Near-zero cost, global edge |
| File storage | Cloudflare R2 (separate bucket) | S3-compatible, zero egress |
| DNS + CDN | Cloudflare | Wildcard DNS, SSL, DDoS |
| SSL | Cloudflare Advanced Certificate Manager ($10/mo) | Wildcard cert for `*.shippie.app` |
| Build runner | Vercel Sandbox (Firecracker microVMs) | Hardware isolation for untrusted npm |
| Functions runtime | Cloudflare Workers for Platforms | V8 isolation, per-app secrets, outbound allowlist |
| GitHub integration | GitHub App (not OAuth App) | Higher rate limits, reliable webhooks, fine-grained perms |
| Search | Postgres FTS + pg_trgm | Sufficient until ~5000 apps |
| SDK distribution | `@shippie/sdk` on npm + cdn.shippie.app + /__shippie/sdk.js same-origin proxy | Max flexibility |
| Email | Resend | Auth flows, notifications |
| Billing | Stripe | Subscriptions + invoices + DPA |
| iOS partner runner (Phase 2) | Codemagic or Expo EAS | macOS builds via API |

### 2.3 Cost Estimate (MVP scale)

| Line | Cost/mo |
|------|---------|
| Vercel Pro (platform + Sandbox credits) | $20 |
| Hetzner CCX23 (Postgres only) | €15 |
| Cloudflare Workers Paid | $5 |
| Cloudflare Workers for Platforms (Functions) | $25 |
| Cloudflare Advanced Certificate Manager | $10 |
| Cloudflare R2 | $0 (MVP tier) |
| Vercel Sandbox overage | $0–$12 |
| Resend | $20 |
| Sentry | $0–$26 |
| AI generation (OpenAI / image model, capped) | $10–$30 |
| Stripe fees | per-transaction |
| Domain + misc | $5 |
| **Total at launch** | **~$110–$175** |

---

## Part 3 — The Three Project Types

Every project is one of `app`, `web_app`, or `website`. Type is inferred in preflight and can be changed post-deploy with a warning.

| | `app` | `web_app` | `website` |
|---|---|---|---|
| **Maker intent** | "Users should have this on their phone" | "Users will open this in a tab, maybe bookmark it" | "This is content people come to" |
| **Install UX** | Aggressive: QR, install banner, "Add to Phone" CTA on every view | Passive: install available after engagement | None |
| **Full-screen PWA** | Required (SW + manifest enforced) | Optional | No |
| **SDK features default** | auth, storage, files, notifications, feedback, native | auth, storage, feedback | analytics, feedback only |
| **Offline expected** | Yes, aggressive SW caching | Partial, stale-while-revalidate | No |
| **Typical size** | <5MB | <20MB | Any |
| **Discovery shelf** | "Apps" | "Tools" | "Sites" |
| **Ranking weight** | installs × 7d retention × engagement | sessions × return visits | views × quality × recency |
| **Ship to Stores eligible** | ✅ Primary target | ⚠️ Case-by-case | ❌ No |
| **"Best on" badge** | mobile | desktop | any |

---

## Part 4 — `shippie.json` Specification

Declarative build + runtime config. Placed at repo root or auto-drafted in preflight. Auto-drafting always happens before preflight blocks, so a missing file never blocks a deploy by itself.

```jsonc
{
  "$schema": "https://shippie.app/schema/shippie.json",
  "version": 1,
  "slug": "recipes",
  "type": "app",                              // "app" | "web_app" | "website"
  "name": "Recipes",
  "tagline": "Save, organize, search your recipes",
  "description": "A simple recipe manager for your phone.",
  "category": "food_and_drink",
  "icon": "./public/icon.png",
  "theme_color": "#f97316",
  "background_color": "#ffffff",

  "framework": "vite",                        // auto-detected if omitted
  "build": {
    "command": "pnpm run build",
    "output": "dist",
    "node": "20",
    "root_directory": ".",
    "env_build": ["VITE_*"],
    "install_command": "pnpm install --frozen-lockfile --ignore-scripts"
  },

  "pwa": {
    "display": "standalone",
    "orientation": "portrait",
    "start_url": "/",
    "scope": "/",
    "conflict_policy": "shippie",             // shippie | merge | own
    "screenshots": ["./public/screen-1.png"]
  },

  "sdk": {
    "version": "1.x",                         // "1.x" auto-patches; "1.2.3" pins
    "auto_inject": true
  },

  "permissions": {
    "auth": true,
    "storage": "rw",                          // "none" | "r" | "rw"
    "files": true,
    "notifications": false,
    "analytics": true,
    "external_network": false,
    "native_bridge": ["share", "haptics", "deviceInfo"]
  },

  "allowed_connect_domains": [],              // CSP connect-src allowlist

  "functions": {
    "enabled": false,
    "directory": "functions",
    "runtime": "workers",
    "env": {
      "STRIPE_KEY": { "required": true,  "secret": true },
      "OPENAI_KEY": { "required": false, "secret": true }
    }
  },

  "listing": {
    "visibility": "public",                   // public | unlisted | private
    "featured_candidate": true,
    "require_consent_screen": false
  },

  "feedback": {
    "enabled": true,
    "types": ["comment", "bug", "request", "rating"]
  },

  "deploy_mode": "quick_ship",                // quick_ship | preview | manual
  "auto_publish_on": ["main"],

  "distribution": {
    "ship_to_web": true,
    "ship_to_phone": true,
    "ship_to_stores": {
      "enabled": false,
      "platforms": ["ios", "android"],
      "bundle_id": "app.shippie.recipes",
      "version": "1.0.0",
      "build_number": 1
    }
  },

  "native": {
    "wrapper": "capacitor",                   // capacitor | twa | auto
    "plugins": ["share", "haptics", "device-info"],
    "ios": {
      "deployment_target": "15.0",
      "sign_in_with_apple": true,
      "encryption_exempt": true
    },
    "android": {
      "min_sdk": 24,
      "target_sdk": 35,
      "play_billing": false
    }
  },

  "store_metadata": {
    "short_description": "Save your favorite recipes",
    "long_description": "A simple recipe manager you can install on your phone.",
    "keywords": ["recipes", "cooking", "meal planner"],
    "support_url": "https://shippie.app/apps/recipes/support",
    "privacy_url": "https://shippie.app/apps/recipes/privacy",
    "marketing_url": "https://recipes.shippie.app",
    "age_rating": "4+",
    "primary_category": "food_and_drink",
    "secondary_category": "lifestyle",
    "contains_ads": false,
    "uses_iap": false,
    "release_notes": "{{ auto-from-changelog }}"
  },

  "compliance": {
    "retains_user_data": true,                // explicit; auto-derived if omitted
    "identifiable_analytics": false,          // must be explicit to opt in
    "account_deletion": {
      "enabled": true,
      "flow": "self_service",                 // self_service | email | function
      "function": null
    },
    "data_safety": {
      "data_collected": ["email", "app_activity"],
      "data_shared": [],
      "encrypted_in_transit": true,
      "encrypted_at_rest": true,
      "can_delete": true
    }
  },

  "env_schema": {
    "VITE_API_URL": { "required": false, "secret": false, "scope": "client" }
  }
}
```

---

## Part 5 — Reserved Route Contract (`__shippie/*`)

The Cloudflare Worker owns these paths on every app origin. Maker files that collide are **hard-blocked at preflight** — no silent rewriting.

### 5.1 System Routes

```
# Core system
__shippie/sdk.js                 GET   — hosted Shippie SDK, same-origin
__shippie/manifest               GET   — generated PWA manifest.json
__shippie/sw.js                  GET   — generated service worker
__shippie/icons/{size}.png       GET   — generated app icons
__shippie/meta                   GET   — app public metadata
__shippie/health                 GET   — runtime health status

# Auth
__shippie/auth/login             GET   — initiate OAuth
__shippie/auth/callback          GET   — exchange code, set session cookie
__shippie/auth/logout            POST  — clear session cookie
__shippie/auth/revoke            POST  — revoke across all devices
__shippie/session                GET   — returns current user or 401
__shippie/session                DELETE — alias for logout

# Storage
__shippie/storage/:collection              GET    — list items (private)
__shippie/storage/:collection/:key         GET/PUT/DELETE
__shippie/storage/public/:collection       GET    — list public items
__shippie/storage/public/:collection/:key  GET/PUT — (auth required for write)

# Files
__shippie/files                  POST  — request presigned R2 upload URL
__shippie/files/:key             GET/DELETE

# Feedback (unified typed system)
__shippie/feedback               POST/GET
__shippie/feedback/:id/vote      POST

# Analytics
__shippie/analytics              POST   — batched event ingest

# Install tracking + handoff
__shippie/install                GET/POST
__shippie/install/phone          GET    — QR/deep link
__shippie/install/store          GET    — deep link to App Store / Play Store when live

# Shippie Functions (user Worker dispatch)
__shippie/fn/*                   GET/POST/PUT/DELETE — invokes matching function
__shippie/fn/_health             GET
__shippie/fn/_logs               GET    — maker-auth only
__shippie/fn/_account_delete     POST   — reserved account deletion route
```

### 5.2 Collision Policy

Any build output under `__shippie/*` is a **hard preflight block**. The error lists the colliding files and shows how to rename them in source. The only exception is the existing `pwa.conflict_policy` for top-level `manifest.json` / `sw.js`:

- `shippie` (default) — platform manifest/SW wins, maker's is ignored
- `merge` — platform manifest merges with maker's keys; SW chains platform SW first
- `own` — maker keeps theirs entirely; Shippie SW-dependent features disabled with warning

Shippie never silently rewrites bundler output. Renaming built files would orphan import graphs.

---

## Part 6 — Auth Architecture (Opaque Session Handles)

### 6.1 Primitives

- **Platform session** — httpOnly cookie on `shippie.app` only. First-party to the control plane.
- **App session cookie** — `__shippie_session` on `{slug}.shippie.app`. Contains only an opaque random string (32 bytes, base64url). No claims inside the cookie.
- **`app_sessions` row** — server-side record holding user_id, app_id, scope, device info, expiry, revocation. Indexed by `handle_hash` (SHA-256 of the handle). This is the canonical session state.

### 6.2 OAuth 2.0 Authorization Code + PKCE Flow

```
1. App code: shippie.auth.signIn(returnTo?)
   ↓
2. Browser → /__shippie/auth/login?return_to=...
   ↓
3. Worker generates PKCE + state, stores in KV (60s TTL),
   redirects to https://shippie.app/oauth/authorize
     ?client_id=app_recipes_xyz
     &redirect_uri=https://recipes.shippie.app/__shippie/auth/callback
     &code_challenge={S256}
     &state={csrf token}
     &scope=auth storage files analytics
   ↓
4. Platform checks shippie.app session cookie
   4a. Signed in + consent on file → auto-redirect to callback with code
   4b. Signed in + no consent → "Allow Recipes to access your Shippie account" screen
   4c. Not signed in → sign-in page → consent → callback
   ↓
5. Browser → https://recipes.shippie.app/__shippie/auth/callback?code=...&state=...
   ↓
6. Worker:
   - validates state from KV
   - POSTs to https://shippie.app/api/internal/oauth/token (signed)
     { code, code_verifier, client_id, device_info }
   - platform verifies PKCE, inserts app_sessions row, returns { handle }
   - Worker sets __shippie_session=<handle> cookie
   - redirects to return_to or "/"
   ↓
7. On subsequent __shippie/storage/* calls:
   - Worker reads cookie, caches session resolution in KV (60s TTL)
   - On cache miss: calls platform /api/internal/session/authorize (HMAC signed)
   - Platform reads app_sessions by handle_hash, checks expiry/revocation,
     returns { user_id, app_id, scope }
   - Worker proxies request to the appropriate internal endpoint
   - Platform sets Postgres RLS session vars, runs the query
```

### 6.3 Security Guarantees

- **No tokens in localStorage**. Nothing for XSS in maker code to steal.
- **Same-origin everything**. No CORS, no third-party cookie quirks. Works on Safari, iOS, everywhere.
- **Revocation is cookie invalidation + session row deletion**. TTL ≤60s; Durable Object broadcast for instant cache invalidation.
- **Per-device sessions** tracked in `app_sessions`, visible in user dashboard, revocable individually.
- **Scope changes** require re-consent but not full re-auth.
- **Worker ↔ Platform signing**: every proxied request carries `X-Shippie-Signature: HMAC-SHA256(secret, method + path + body + timestamp)` and `X-Shippie-Timestamp`. Platform rejects requests older than 30s. Secret rotates via dual-key.

---

## Part 7 — Shippie SDK

### 7.1 Surface Area (all same-origin)

```typescript
// Auth
shippie.auth.getUser(): Promise<User | null>           // GET /__shippie/session
shippie.auth.signIn(returnTo?): Promise<User>          // navigates to /__shippie/auth/login
shippie.auth.signOut(): Promise<void>                  // POST /__shippie/auth/logout
shippie.auth.onChange(cb): Unsubscribe                 // BroadcastChannel on same origin

// Storage
shippie.db.set(collection, key, data, opts?): Promise<void>
shippie.db.get(collection, key): Promise<T | null>
shippie.db.list(collection, opts?): Promise<T[]>
shippie.db.delete(collection, key): Promise<void>
// opts: { public?: boolean, ttl?: number }

// Files
shippie.files.upload(blob, filename): Promise<{ url, key }>
shippie.files.get(key): Promise<Blob>
shippie.files.delete(key): Promise<void>

// Notifications (Phase 2)
shippie.notify.send(title, body, opts?)
shippie.notify.subscribe()

// Analytics
shippie.track(event, props?, opts?)                    // opts.identify requires compliance flag

// Feedback
shippie.feedback.open(type?)                           // opens native modal
shippie.feedback.submit(item)                          // programmatic

// Install
shippie.install.prompt()
shippie.install.status(): 'installed' | 'installable' | 'unsupported'

// Meta
shippie.meta(): Promise<AppMeta>                       // GET /__shippie/meta

// Native Bridge (v6 addition — works on web, wrapped on native)
shippie.native.share({ title, text, url })
shippie.native.haptics.impact('medium')
shippie.native.deviceInfo()
shippie.native.deepLink.register(scheme)
shippie.native.appReview.request()
shippie.native.notifications.scheduleLocal({ ... })
shippie.native.clipboard.write('text')
shippie.native.appState.onResume(cb)
// Phase 2: camera, biometric, contacts, filesystem
```

### 7.2 Distribution

- **npm**: `@shippie/sdk` (ESM + CJS + IIFE; TypeScript types bundled)
- **Hosted**: `cdn.shippie.app/sdk/v1.latest.js` + `cdn.shippie.app/sdk/v1.2.3.js` (pinned, immutable)
- **Same-origin**: `__shippie/sdk.js` auto-injected by deploy pipeline; Worker proxies to the hosted CDN so apps get cache locality on their own origin

### 7.3 Shippie Native Bridge

Feature-detecting layer. Same code runs as web, PWA, and Capacitor-wrapped native. On web: Web APIs. In wrapper: Capacitor plugins.

This is the **anti-rejection layer** for Apple's Rule 4.2 (Minimum Functionality). Apps that use ≥1 Native Bridge feature demonstrably provide a "platform-specific experience" — the exact phrase Apple uses as the approval criterion. The Native Readiness Score rewards Native Bridge usage because it's what pushes an app past minimum-functionality.

---

## Part 8 — Shippie Functions

### 8.1 Purpose

Per-app server-side capability for secret-backed calls (Stripe, OpenAI, private APIs, CRMs). Without this, makers with legitimate server needs would fall off the "one-shot live" promise.

### 8.2 Runtime — Cloudflare Workers for Platforms (CFW4P)

- Each app's function code is deployed as a user Worker in a dispatch namespace
- V8 isolate boundary = hardware isolation identical to the main Cloudflare edge
- Per-app env bindings hold secrets (makers never see raw values; their code accesses via `env.STRIPE_KEY`)
- **Outbound fetch wrapped** by a runtime shim that enforces `allowed_connect_domains` — requests to non-allowlisted domains return 403
- **Built-in limits**: 50ms CPU, 128MB memory, max subrequests per invocation
- **Logs** via Tail Workers → pushed to Postgres `function_logs` (partitioned, 30d retention)
- **Cost**: CFW4P subscription is $25/mo flat + per-request pricing

### 8.3 Developer Shape

```
repo/
├── functions/
│   ├── subscribe.ts       # POST /__shippie/fn/subscribe
│   ├── ai/chat.ts         # POST /__shippie/fn/ai/chat
│   └── webhook.ts         # POST /__shippie/fn/webhook
├── index.html
└── shippie.json
```

```typescript
import type { ShippieFunctionContext } from '@shippie/functions';

export default async function handler(ctx: ShippieFunctionContext) {
  // ctx.user      → authenticated user or null
  // ctx.env       → per-app secrets (STRIPE_KEY, etc.)
  // ctx.request   → incoming Request
  // ctx.db        → same-origin Shippie DB (RLS-scoped to user+app)
  // ctx.fetch     → allowlisted fetch
  // ctx.log       → structured logging

  const stripe = new Stripe(ctx.env.STRIPE_KEY);
  const sub = await stripe.subscriptions.create({ customer: ctx.user.id });
  await ctx.db.set('subscriptions', sub.id, sub);
  return Response.json({ ok: true });
}
```

### 8.4 The `needs_secrets` Deploy State

Deploy-level state (not app-level), lives on `deploys.status`:

```
Deploy status: building → needs_secrets → success
                  ↓              ↓
               failed       (resume with secrets — same row reused)
```

Process:
1. Deploy pipeline reads `functions/` + `shippie.json.functions.env`
2. If any `required: true` secrets missing, deploy completes in `needs_secrets`
3. App is live at `{slug}.shippie.app` — non-function features work immediately (auth, storage, files, feedback)
4. Function routes return 503 with "app needs configuration"
5. Maker sets secrets via dashboard → Shippie re-dispatches the Functions deploy (same `deploys` row is updated, not a new row) → status transitions to `success`

`apps.latest_deploy_id` / `apps.latest_deploy_status` / `apps.active_deploy_id` / `apps.preview_deploy_id` are derived caches maintained by a DB trigger on `deploys` changes. See §18.

### 8.5 Defense in Depth

- `npm ci --ignore-scripts` (+ per-package-manager equivalents) prevents postinstall execution in the Vercel Sandbox build runner
- 72-hour package age quarantine (configurable; `npm config set min-release-age 3`)
- Network isolation during install phase
- Hard build timeout (10 min) + resource limits (4 vCPU, 4GB)
- Static analysis of the Functions bundle for: `ctx.user` references, `ctx.db.*` writes, `ctx.files.*` writes, outbound fetches with user-derived bodies/headers/URLs, dynamic imports, eval, suspicious secret names
- ClamAV scan on build output

---

## Part 9 — PWA Injection Pipeline

### 9.1 Build-Time (Primary)

On every deploy, after extracting build output:

1. Walk all `.html` files with `htmlparser2`
2. Inject into `<head>`:
   - `<link rel="manifest" href="/__shippie/manifest">`
   - `<meta name="theme-color" content="{theme_color}">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
   - `<link rel="apple-touch-icon" href="/__shippie/icons/180.png">`
   - `<link rel="icon" type="image/png" sizes="192x192" href="/__shippie/icons/192.png">`
   - Per-app CSP meta tag
   - `<script src="/__shippie/sdk.js" async></script>`
3. Inject before `</body>`: service worker registration script that registers `/__shippie/sw.js`
4. Resize uploaded icon to 48, 72, 96, 144, 152, 180, 192, 256, 384, 512, 1024
5. Generate splash screens for common iOS device sizes
6. Upload resized assets to `r2://shippie-apps/{slug}/v{version}/__shippie-assets/`

### 9.2 Runtime (Worker HTMLRewriter fallback)

Worker injects missing PWA tags at response time if build-time injection couldn't parse the HTML. Safety net.

### 9.3 Service Worker Strategy

- **HTML documents**: network-first (always try fresh, fallback cache)
- **Hashed assets** (`/_next/static/*.{hash}.js`): cache-first, immutable, 1-year max-age
- **Unhashed assets**: stale-while-revalidate
- **`__shippie/*` calls**: never cache
- **Version naming**: caches named `{slug}-v{version}`; old caches removed on `activate` event
- **Update flow**: SDK checks `__shippie/health` for current version; mismatch triggers `registration.update()` + non-blocking refresh banner

### 9.4 iOS Reality

- No `beforeinstallprompt` event on iOS Safari — show custom "Add to Home Screen" banner with share-button guide
- No background sync, no periodic background sync, no silent push
- 7-day storage auto-clear rule — service worker + IndexedDB persistence requests; warn user if `last_seen_at > 5d`
- Web Push available on iOS 16.4+ only inside installed PWAs
- Treat iOS as offline-first with manual refresh on app open

---

## Part 10 — Deploy Pipeline

### 10.1 States

**Deploy-level** (`deploys.status`):
```
building → needs_secrets → success
   ↓            ↓
failed      (resume)
```

**App-level** (derived from `active_deploy_id` / `latest_deploy_id`):
```
draft → has_live_version → takedown
```

### 10.2 Atomic Version Pointer

**Postgres is the source of truth.** Cloudflare KV is a read-through cache invalidated by Durable Object broadcast.

- `apps.active_version` / `apps.active_deploy_id` — what's serving at `{slug}.shippie.app`
- `apps.preview_version` / `apps.preview_deploy_id` — preview track (Pro feature)
- `apps.latest_deploy_id` / `apps.latest_deploy_status` — cache of most recent deploy (maintained by trigger)

**Publish / rollback**:
1. Platform writes `apps.active_deploy_id = new_id` inside a transaction
2. Async job invalidates KV key `apps:{slug}:active`
3. Durable Object broadcast drops all Worker in-memory caches
4. Worker reads new value on next request (cold path: direct platform API call)

Instant rollback = update Postgres → broadcast → Worker serves old version within ~2 seconds. No file movement.

**Retention**: last 10 versions or 30 days (whichever is more), purged by cron.

### 10.3 Quick Ship (Default)

- **Quick Ship**: if preflight passes AND visibility is public/unlisted AND `deploy_mode != "preview"` → publish immediately. App goes live at `{slug}.shippie.app`, listing created on `shippie.app`.
- **Preview-first (opt-in)**: maker sets `"deploy_mode": "preview"` in `shippie.json`. Default for business/org-owned apps above a trust tier.
- **Quick Ship with warnings**: preflight warnings (not blockers) allow publish but surface warnings on the detail page until resolved.
- **Blocked**: preflight blockers prevent any publish (malware, reserved path collision, hard limits).

**Quick Ship SLO**: 80% of first-time GitHub deploys live in <3 minutes with no extra maker input. Instrumented via `users.first_deploy_duration_ms`. Weekly p80 regression alerts.

### 10.4 Auto-Remediation (Before Preflight Block)

Preflight attempts auto-fix before failing:

| Failure | Auto-remediation |
|---------|------------------|
| Missing `shippie.json` | Auto-draft from framework + README + detected files |
| Missing icon | OG image → favicon → first square image in public → AI-generate |
| Missing `name` | Use repo name or `package.json.name` |
| Missing `description` | Extract from README first paragraph |
| Framework not detected | Static fallback; if still fails, 3-click override with PM + output-dir selectors |
| Monorepo with multiple apps | Detect `shippie.json` in subdirs; if only one valid, use it; if many, one-click chooser |
| Node version mismatch | Try latest LTS in sandbox; if that fails, version selector |
| `__shippie/*` collision | **Hard block** with clear error. Never silently rewritten. Exception: top-level `manifest.json`/`sw.js` per `conflict_policy`. |

Dead-end errors (malware, reserved slug, preflight critical) are rare and always actionable.

### 10.5 Build Contract

**Package manager detection:**

| Lockfile | Install | Build |
|----------|---------|-------|
| `package-lock.json` | `npm ci --ignore-scripts` | `npm run build` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile --ignore-scripts` | `pnpm build` |
| `yarn.lock` | `yarn install --immutable --mode skip-build` | `yarn build` |
| `bun.lockb` / `bun.lock` | `bun install --frozen-lockfile --ignore-scripts` | `bun run build` |

**Framework presets (auto-detected):**

| Signal | Framework | Output dir |
|--------|-----------|-----------|
| `next.config.*` + `output: "export"` | Next.js (static) | `out` |
| `vite.config.*` | Vite | `dist` |
| `astro.config.*` | Astro | `dist` |
| `nuxt.config.*` (generate) | Nuxt | `.output/public` |
| `svelte.config.js` + adapter-static | SvelteKit | `build` |
| `remix.config.js` SPA mode | Remix | `public` |
| `solid.config.js` | SolidStart | `.output/public` |
| Lit deps | Lit | `dist` |
| `_config.yml` + `_layouts/` | Jekyll | `_site` |
| `config.toml` + `content/` | Hugo | `public` |
| `package.json` only | Static | `dist` / `build` / `public` |
| `index.html` root, no `package.json` | Pure HTML | repo root |

**AI-tool repo detection:**
- `.bolt/`, `.lovable/`, `.cursor/`, `.v0/`, `components.json` — apply framework-appropriate defaults
- Monorepo: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `workspaces` — detect and prompt for root_directory

### 10.6 Deploy Flow

```
Source ready (GitHub clone or zip extracted to R2 staging)
  ↓
Detect package manager + framework + shippie.json (auto-draft)
  ↓
Preflight
  - slug rules + reserved slugs
  - reserved __shippie/* path collision → HARD BLOCK
  - manifest/SW conflict vs conflict_policy
  - unsupported patterns (SSR in app type)
  - size limits (200MB default)
  - package age (72h quarantine)
  - secret leakage scan
  - malware static analysis + ClamAV
  - CSP/allowlist validation
  - Functions static analysis (if enabled)
  ↓
  blockers? → fail, surface errors, end
  warnings? → continue, carry to listing
  ↓
Build (Vercel Sandbox; skipped for pre-built static)
  - install with detected PM, --ignore-scripts
  - run build command with framework preset
  - stream logs via SSE
  - extract output from detected dir
  ↓
Functions build (if functions/ present)
  - compile each function with esbuild
  - bundle runtime shim (fetch allowlist, ctx.env, ctx.db, ctx.log)
  - deploy to CFW4P dispatch namespace
  - attach secrets from function_secrets
  ↓
PWA injection (build-time)
  - manifest, meta tags, SDK script, SW registration
  - per-app CSP
  - icon resizing + splash screens
  ↓
Auto-packaging (async, non-blocking)
  - icon fallback (AI if needed)
  - listing copy generation
  - compatibility report
  - store-size screenshots (parallel job)
  ↓
Upload to R2: shippie-apps/{slug}/v{version}/*
  ↓
Postgres write (source of truth)
  - INSERT deploys row (or UPDATE for needs_secrets resume)
  - INSERT deploy_artifacts row
  - UPDATE apps SET active_deploy_id = ... (Quick Ship)
    OR UPDATE apps SET preview_deploy_id = ... (Preview)
  - audit_log entry
  ↓
KV + broadcast
  - Write apps:{slug}:active = v{version}
  - Durable Object broadcast version swap
  ↓
Post-deploy (async)
  - Screenshot capture (headless Chrome)
  - External domain re-scan
  - Warm cache
  - Email/notify maker
  ↓
LIVE at {slug}.shippie.app + listing at shippie.app/apps/{slug}
```

### 10.7 Timing Targets

- Static zip: **< 45s**
- GitHub static project: **< 2.5 min**
- GitHub Vite/Next static: **< 3 min**
- With Functions: **+30–60s** for CFW4P dispatch

### 10.8 Build Cache

Cache `node_modules` keyed by hash of `package-lock.json` (or pnpm/yarn/bun equivalent) + Node version + OS. Stored in R2 as tar.zst. 30-day LRU. Subsequent builds with the same lockfile skip install.

---

## Part 11 — Auto-Packaging Layer

### 11.1 What Gets Auto-Generated

| Asset | Sources (order of preference) | Fallback |
|-------|-------------------------------|----------|
| **Icon** | `./icon.png`, `public/icon.png`, `favicon.png` at ≥512px | OG image → first square image → screenshot crop → **AI-generated** |
| **Screenshots** | `public/screenshot-*.png`, `shippie.json.pwa.screenshots` | **Headless Chrome capture** after deploy — web sizes + all store sizes |
| **Manifest** | Maker's `manifest.json` (merged per `conflict_policy`) | Generated from app metadata |
| **Listing copy** | README title/description; `shippie.json` fields | AI-summarized from README; 1-line tagline + 3-sentence description |
| **Changelog** | Git commit messages since last deploy | `CHANGELOG.md` → "Initial release" |
| **Install QR** | Always generated per app | — |
| **Permissions page** | `shippie.json.permissions` + SDK call static analysis | Inferred from build artifacts |
| **Compatibility report** | Static analysis of SDK usage vs `shippie.json` | — |
| **OG social card** | Auto-rendered from icon + name + tagline + theme_color | — |

### 11.2 Screenshot Capture — Web + Store Sizes in One Pass

Post-deploy headless Chrome job captures:

**Web sizes:**
- Mobile portrait 390×844
- Mobile landscape 844×390
- Desktop 1280×800
- Hero 1200×630 (for OG cards)

**iOS store sizes:**
- iPhone 6.5" 1284×2778
- iPhone 5.5" 1242×2208 (optional, still required in some cases)
- iPad Pro 13" 2064×2752 (if iPad supported)

**Android store sizes:**
- Phone 1080×1920
- 7" tablet 1200×1920
- 10" tablet 1920×1200
- Feature graphic 1024×500

All uploaded to `public-assets/{app_id}/screenshots/v{version}/`. One pipeline, one pass, serving both the listing and Ship to Stores.

### 11.3 AI Icon + Copy (Feature-Flagged)

- **Icon**: strict prompt — "minimalist app icon for {name}, theme color {hex}, category {category}, simple, recognizable at 64px, no text"
- **Copy**: "Write a 1-line tagline and 3-sentence description for {name}, a {type} that {description}. Tone: clear, practical."
- Cost-controlled: only called if nothing else worked
- Makers can regenerate or override
- Budget caps enforced via platform usage metering

### 11.4 Compatibility Report

```
Compatibility: ★★★★☆ (Good)

✓ Auth enabled — sign-in works
✓ Storage enabled — data persists per user
✓ Feedback enabled — users can report issues
✓ Analytics enabled — anonymized usage tracked
⚠ Notifications requested but service worker not registered
✗ File uploads not declared in shippie.json but code uses shippie.files.upload (will fail at runtime)
```

Feeds into Native Readiness Score and permission-to-runtime enforcement.

---

## Part 12 — Ship to Stores

### 12.1 Native Readiness Score (0–100)

Computed on every deploy. Visible on maker dashboard. Enforced on Ship to Stores submission.

**Required for any score above 0 (every app):**
- `support_email` on app or org
- `privacy_policy_url` set (or Shippie's auto-generated default)
- `age_rating` declared
- `primary_category` set
- `bundle_id` set (reverse-DNS, unique per subject)

**Required for >50:**
- Store icon 1024×1024 (auto-generated acceptable)
- iOS screenshots: 6.5" + optional 5.5" + optional iPad Pro 13"
- Android screenshots: phone + optional 7" tablet + optional 10" tablet
- `short_description` (30–80 chars) + `long_description` (up to 4000 chars)
- Keywords (iOS, max 100 chars) + tags (Play)
- Release notes (auto-from-changelog acceptable)

**Required for >85 (ready to submit):**
- If any OAuth provider offered on iOS → **Sign in with Apple enabled and working**
- iOS Privacy Manifest complete (auto-generated from static analysis + manual additions)
- Android Data Safety form complete
- **No WebView-only rejection risk** — app uses ≥1 Shippie Native Bridge feature
- Verified maker or verified org
- Legal entity + billing address
- `__shippie/fn/_account_delete` passes integration test (runs pre-submission)
- **iOS signing config registered and verified** (see §13)

**100:**
- All above + Capacitor wrapper builds cleanly + signed artifact exists in R2

### 12.2 Conditional Account Deletion

Required **only** when the app retains user data. Three-stage rule:

**Stage 1 — Hard triggers (no override):**
- `permissions.auth == true`
- `permissions.storage != "none"`
- `permissions.files == true`
- `compliance.retains_user_data == true` (explicit)
- `compliance.identifiable_analytics == true`

**Stage 2 — Functions default:**
- `functions.enabled == true` → `retains_user_data = true` unless the **static analyzer proves the Functions bundle is stateless**

**Stage 3 — Fail-closed:**
- Inconclusive analysis → treated as retaining data
- No runtime override possible

A Functions bundle is **stateless** only if static analysis finds **none** of:
- `ctx.user` references
- `ctx.db.*` / `ctx.files.*` writes
- Outbound `ctx.fetch` with user-derived bodies/headers/URLs
- Dynamic imports or `eval` / `Function()` constructor
- Suspicious secret names: `DATABASE_URL`, `SUPABASE_*`, `FIREBASE_*`, `REDIS_URL`, `MONGODB_URI`, etc.

Makers can annotate with `// @shippie-stateless: reason` for audit traceability, but annotations never silence the gate — only remove them from the inconclusive report.

Stateless apps get `compliance_checks.status = 'not_applicable'` and are unaffected by the readiness gate.

### 12.3 iOS Submission — Prep Kit Only at Launch

Vercel Sandbox does not ship a macOS runner. For iOS at launch, Shippie generates a complete, signed-ready Capacitor project that the maker builds locally.

**Launch iOS path:**
1. Shippie generates Capacitor project with full iOS config:
   - Info.plist populated
   - `PrivacyInfo.xcprivacy` from `privacy_manifests` table
   - Sign in with Apple capability if required
   - Native Bridge plugins wired per `shippie.json.native.plugins`
   - Shippie SDK pre-bundled
2. Fastlane config for one-command TestFlight upload
3. Maker downloads the prep kit zip
4. Maker runs `shippie ios-build` on a Mac with Xcode
5. TestFlight upload uses maker's own Apple credentials
6. **Production track + Shippie-managed signing are labelled "Phase 2 — coming soon" and disabled in the UI at launch**

**Phase 2**: Codemagic / Expo EAS partner runner for automated builds.
**Phase 3**: Direct App Store Connect API for TestFlight + Production.

### 12.4 Android Submission — Fully Automated at Launch

```
Maker clicks "Ship to Stores"
  ↓
Native Bundle build job fires
  ↓
Pull latest live version from R2
  ↓
Generate Capacitor or TWA project:
  - TWA via Bubblewrap for simple type=app projects
  - Capacitor for apps needing Native Bridge plugins
  ↓
Build .aab via Gradle in Vercel Sandbox (Linux)
  ↓
Sign with maker-managed or Shippie-managed keystore
  ↓
Upload to Play Console via Play Developer API v3
  → internal / closed / production track per maker choice
  ↓
Poll for status; update native_bundles.submission_status
  ↓
Notify maker on status change
```

"Ship to Play Store in 10 minutes" is a realistic launch promise for Android.

### 12.5 Signing Credentials — Split Model

Reusable account credentials live in `store_account_credentials` (subject-scoped: user or org). App-specific signing assets live in `app_signing_configs` (per-app, per-platform, with exactly one active per `(app_id, platform)` enforced by partial unique index).

**Android signing modes:**
- **Maker-managed**: upload `.jks` + alias + passwords; encrypted in `app_signing_configs`
- **Shippie-managed**: Shippie generates + holds the keystore per app

**iOS signing modes:**
- **Automatic** (recommended for solo makers):
  - Mac with Xcode installed, signed into an Apple ID that is a member of the Team
  - Shippie stores nothing; Prep Kit emits `ENABLE_AUTOMATIC_CODE_SIGNING=YES` + `DEVELOPMENT_TEAM`
  - Must be **verified** via the `shippie ios-verify` flow (see §13)
- **Manual**:
  - Distribution `.p12` certificate uploaded + encrypted
  - App Store provisioning profile uploaded + encrypted
  - Prep Kit installs both into Xcode build folder
  - Statically verified at registration: `mobileprovision` plist parsed; team match, bundle match, expiry >30 days
- **Upload credentials** (optional):
  - App Store Connect API key (.p8 + Key ID + Issuer ID) stored in `store_account_credentials` with `credential_type='asc_api_key'`
  - Used by Fastlane for `xcrun altool --upload-app`
  - If omitted, maker uploads manually via Xcode Organizer

**Shippie-managed iOS signing is Phase 3 only.** The launch UI presents no iOS path the backend cannot fulfill.

---

## Part 13 — iOS Verification Pipeline

This is the most critical correctness-sensitive subsystem in the spec. It enforces that every iOS submission is tied to a real, active, verified signing configuration.

### 13.1 The Goal

Automatic signing on a Mac cannot be verified server-side — the prerequisites (Xcode, Apple ID, Team membership) live on the maker's machine. But the readiness gate must not accept unverified claims. Solution: **guided self-attestation with tamper-evident audit trail**, bounded by the fact that Apple's review is the final backstop.

### 13.2 Two Compliance Checks

- **`ios-signing-config-registered`** — static metadata check. Team ID, bundle ID, signing mode populated. For manual mode, also parses `mobileprovision` to verify team+bundle match and expiry >30 days.
- **`ios-signing-verified`** — verification check. For manual mode: always passes (static verification sufficient). For automatic mode: requires a fresh, active verification bound to the current signing config.

Both checks are `required: true` for iOS targets. Automatic signing cannot reach score ≥85 without a fresh verification.

### 13.3 Verify Kit Lifecycle

The maker downloads a verify kit bundle containing a shell script pre-filled with:
- `APP_ID`, `SIGNING_CONFIG_ID`, `TEAM_ID`, `BUNDLE_ID`
- A one-time `NONCE`
- A per-kit `SECRET` (encrypted at rest in `ios_verify_kits.secret`, decrypted server-side per request)
- The callback URL

Kit is issued via the dashboard on demand. 14-day expiry. One-time consumption.

### 13.4 What the Verify Script Actually Does

```bash
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  clean build
```

Key properties:
- **`clean build`** — real compilation, not `-showBuildSettings`. Exercises the full signing pipeline: cert resolution, profile resolution/download, entitlements stamping, `codesign` pass on the built `.app`.
- **`-allowProvisioningUpdates`** — permits xcodebuild to talk to Apple's Developer API to fetch/refresh profiles. Without this, automatic signing fails at the CLI level even when Xcode GUI works.
- **`CODE_SIGN_IDENTITY="Apple Distribution"`** — forces use of the distribution cert, matching real submission.
- **`PRODUCT_BUNDLE_IDENTIFIER`** — locked from shippie.json, preventing passes on wildcard defaults.

Timing: 30–90s first run, 20–40s warm. No IPA uploaded — we only prove signing can happen.

### 13.5 Callback Protocol

The script computes HMAC-SHA256 over `app_id | signing_config_id | nonce | result | log_sha256` using the kit secret, then POSTs:

```json
{
  "app_id": "...",
  "signing_config_id": "...",
  "nonce": "...",
  "result": "success" | "failure",
  "reason": "...",
  "log_sha256": "...",
  "log_gz_b64": "...",
  "hmac": "...",
  "xcode_version": "...",
  "macos_version": "..."
}
```

Including `log_sha256` in the HMAC input binds the log to the signature — a forged log changes the hash, breaking the HMAC.

### 13.6 Server-Side Validation (Race-Free, Replay-Free)

The callback handler enforces every invariant in a defined order:

```typescript
// 1. Kit lookup (app_id + nonce)
const kit = await db.query.iosVerifyKits.findFirst({ ... })
if (!kit) return 404
if (kit.consumedAt) return 409 'already consumed'
if (kit.expiresAt < new Date()) return 410 'expired'

// 2. Body/kit binding — server is source of truth
if (body.signing_config_id !== kit.signingConfigId) {
  await recordRejection(kit, 'signing_config_id mismatch with kit')
  return 403
}

// 3. HMAC check (log hash is in the signed input)
if (!verifyHmac(body, decryptKitSecret(kit.secret))) {
  await recordRejection(kit, 'hmac mismatch')
  return 401
}

// 4. Log integrity — re-hash decompressed log, compare to claimed sha256
const logBuf = gunzipSync(Buffer.from(body.log_gz_b64, 'base64'))
if (sha256(logBuf) !== body.log_sha256) {
  await recordRejection(kit, 'log_sha256 mismatch')
  return 400
}

// 5. Log marker check — server parses for required signing markers
const REQUIRED = [
  /ProvisioningProfile=/i,
  /CodeSign .+\.app/,
  /=== BUILD TARGET .+ OF PROJECT .+ WITH CONFIGURATION Release ===/,
  /Signing Identity: +"Apple Distribution/,
  /\*\* BUILD SUCCEEDED \*\*/,
]
if (body.result === 'success' && REQUIRED.some(r => !r.test(log))) {
  await recordRejection(kit, 'log missing required signing markers')
  return 400
}

// 6. Active-config check + atomic consume + insert in ONE transaction
try {
  await db.transaction(async (tx) => {
    // 6a. Lock kit's signing config row FOR UPDATE
    //     Concurrent rotation's UPDATE will block here until we commit
    const [locked] = await tx.execute<{ id, is_active }>(sql`
      select id, is_active from app_signing_configs
       where id = ${kit.signingConfigId}
         for update
    `)
    if (!locked) throw new VerifyError(410, 'signing config no longer exists')
    if (!locked.is_active) throw new VerifyError(409, 'signing config no longer active — download fresh kit')

    // 6b. Atomic consume-if-unconsumed
    const consumed = await tx.update(iosVerifyKits)
      .set({ consumedAt: sql`now()`, consumptionOutcome: 'accepted' })
      .where(and(
        eq(iosVerifyKits.id, kit.id),
        isNull(iosVerifyKits.consumedAt),
      ))
      .returning({ id: iosVerifyKits.id })

    if (consumed.length === 0) {
      // Lost race — another concurrent callback already consumed this kit.
      // Do NOT call recordRejection (would overwrite winner's final state).
      throw new VerifyError(409, 'kit already consumed by a concurrent callback')
    }

    // 6c. Insert verification with kit.signingConfigId (canonical)
    await tx.insert(iosSigningVerifications).values({
      appId: kit.appId,
      signingConfigId: kit.signingConfigId,  // canonical, not body-derived
      nonce: body.nonce,
      succeededAt: body.result === 'success' ? sql`now()` : null,
      failedAt:    body.result === 'failure' ? sql`now()` : null,
      failureReason: body.result === 'failure' ? body.reason : null,
      xcodeVersion: body.xcode_version,
      macosVersion: body.macos_version,
      logR2Key: await storeLogInR2(kit.appId, logBuf),
      verifyKitVersion: kit.kitVersion,
    })
  })
} catch (err) {
  if (err instanceof VerifyError) {
    // Don't rejection-record the "already consumed by concurrent callback" case
    const alreadyConsumed = err.status === 409 && err.message.includes('already consumed')
    if (!alreadyConsumed) await recordRejection(kit, err.message)
    return Response.json({ error: err.message }, { status: err.status })
  }
  throw err
}

return Response.json({ ok: true, outcome: body.result })
```

### 13.7 `recordRejection` Contract

Atomic, idempotent:

```typescript
export async function recordRejection(kit: IosVerifyKit, reason: string) {
  await db.update(iosVerifyKits)
    .set({
      consumedAt: sql`now()`,
      consumptionOutcome: 'rejected',
      rejectionReason: reason,
    })
    .where(and(
      eq(iosVerifyKits.id, kit.id),
      isNull(iosVerifyKits.consumedAt),
    ))
}
```

One UPDATE sets all three fields. `WHERE consumed_at IS NULL` guard makes double-call a no-op.

### 13.8 Verification Lookup (Active-Bound)

The `ios-signing-verified` check always binds to the currently active signing config:

```typescript
const active = await resolveSigningConfig(ctx.app, 'ios')
if (active.iosSigningMode === 'manual') {
  return pass({ source: 'static-manual', signing_config_id: active.id })
}

const verification = await db.query.iosSigningVerifications.findFirst({
  where: and(
    eq(iosSigningVerifications.appId, ctx.app.id),
    eq(iosSigningVerifications.signingConfigId, active.id),  // active-bound
    isNull(iosSigningVerifications.invalidatedAt),
    isNotNull(iosSigningVerifications.succeededAt),
  ),
  orderBy: desc(iosSigningVerifications.succeededAt),
})

if (!verification) {
  return needsAction('Run `shippie ios-verify` on your Mac', {
    cta: 'download-ios-verify-kit',
    app_id: ctx.app.id,
    signing_config_id: active.id,
  })
}

const ageDays = daysBetween(verification.succeededAt, Date.now())
if (ageDays > 90) {
  return needsAction('Verification older than 90 days — re-verify', { ... })
}

return pass({ source: 'verify-kit', signing_config_id: active.id })
```

### 13.9 Invalidation — Two Paths

**Path 1 — Rotation (application-level):**
`rotateSigningConfig()` creates a new config row, atomically flips `is_active`, then explicitly invalidates all iOS verifications not bound to the new row:

```typescript
await tx.update(iosSigningVerifications)
  .set({ invalidatedAt: new Date(), invalidatedReason: `rotated; superseded by ${inserted.id}` })
  .where(and(
    eq(iosSigningVerifications.appId, appId),
    ne(iosSigningVerifications.signingConfigId, inserted.id),
    isNull(iosSigningVerifications.invalidatedAt),
  ))
```

**Path 2 — In-place edits (DB trigger):**
`invalidate_verifications_on_config_change` trigger fires on UPDATE to `app_signing_configs` when any signing-identity field changes:

```sql
create or replace function invalidate_verifications_on_config_change()
returns trigger as $$
begin
  if NEW.platform <> 'ios' then return NEW; end if;

  if (
       coalesce(OLD.ios_team_id,          '') is distinct from coalesce(NEW.ios_team_id,          '')
    or coalesce(OLD.ios_bundle_id,        '') is distinct from coalesce(NEW.ios_bundle_id,        '')
    or coalesce(OLD.ios_signing_mode,     '') is distinct from coalesce(NEW.ios_signing_mode,     '')
    or coalesce(OLD.ios_certificate_r2_key,        '') is distinct from coalesce(NEW.ios_certificate_r2_key,        '')
    or coalesce(OLD.ios_provisioning_profile_r2_key,'') is distinct from coalesce(NEW.ios_provisioning_profile_r2_key,'')
    or coalesce(OLD.ios_entitlements_plist_r2_key, '') is distinct from coalesce(NEW.ios_entitlements_plist_r2_key, '')
  ) then
    update ios_signing_verifications
       set invalidated_at = now(),
           invalidated_reason = format('config %s updated in place on version %s', NEW.id, NEW.version)
     where signing_config_id = NEW.id and invalidated_at is null;
  end if;

  return NEW;
end $$ language plpgsql;
```

The trigger does not fire on `is_active`-only flips (rotation handles that separately). The two paths cover different bypass scenarios:

| Change type | Trigger catches | Rotation catches |
|---|---|---|
| Rotation (new row, old deactivated) | No | Yes |
| In-place edit of identity fields on active row | Yes | No |
| `is_active`-only flip | No | N/A |

### 13.10 Honest Framing

**What the mechanism proves:**
- Every verification was issued to a specific active signing config
- Every verification was returned within the kit's one-time lifecycle
- Every verification was accompanied by an xcodebuild log containing real signing markers
- Client-side field tampering is blocked server-side
- Duplicate concurrent callbacks cannot both produce accepted verifications
- In-place signing edits and rotations invalidate prior verifications

**What the mechanism does not prove:**
- That the signed build the maker ran was actually of this app's code. A determined maker could run a real signed build of a decoy project and submit that log.

**The mechanism is guided self-attestation with a strong audit trail**, not cryptographic proof of intent. The practical backstop is that real App Store submission will catch any mismatch — Apple's review rejects bundles that don't actually build or sign in the claimed state.

The gate is designed to make **accidental and casual passes impossible** and to **produce a forensic audit trail for deliberate fraud**, not to defeat a determined adversary. Makers who cheat here will fail at real submission regardless.

This framing lives in `docs/security.md`, the dashboard "Learn how we verify" modal, and SOC2 / DPA packets for business customers.

---

## Part 14 — Compliance Automation

### 14.1 Privacy Manifest Generator

Runs on every deploy. Static analysis extracts:
- SDK calls used (`shippie.auth.*`, `shippie.db.*`, `shippie.files.*`, `shippie.notify.*`, `shippie.track.*`, `shippie.native.*`)
- Third-party scripts in build output via AST walk
- Function outbound domains from Functions bundle
- Cookies and local storage usage

Produces:

**iOS `PrivacyInfo.xcprivacy`:**
- `NSPrivacyCollectedDataTypes` — mapped from SDK usage (Email from auth, User Content from storage, Photos from camera, etc.)
- `NSPrivacyAccessedAPITypes` — mapped from Native Bridge usage
- `NSPrivacyTracking` — false by default unless analytics SDKs detected

**Android Data Safety form:**
- Data collected / shared
- Purpose of collection
- Optional vs required
- Encrypted in transit / at rest (true by default)
- Data deletion request (true — account deletion endpoint enforced)

Maker reviews auto-generated form in dashboard, edits if needed. Changes tracked in `privacy_manifests` history.

### 14.2 Account Deletion Reserved Route

`__shippie/fn/_account_delete` is system-reserved. When maker enables `compliance.account_deletion.enabled = true`, Shippie exposes it automatically:

1. User triggers delete via `shippie.auth.deleteAccount()` or POST to the reserved route
2. Email confirmation sent (Resend)
3. 14-day grace period recorded in `account_deletion_requests`
4. Daily cron sweeps expired grace periods → wipes all `app_data`, `app_files`, `app_sessions`, `analytics_events`, `feedback_items` for that (user, app) pair
5. Notifies user of completion

Auto-generates a privacy-compliant "Delete my data" page at `shippie.app/apps/{slug}/privacy/delete-me` satisfying both store requirements.

### 14.3 Sign in with Apple Enforcement

Rule: if `permissions.auth = true` AND any OAuth provider besides Apple is available AND `distribution.ship_to_stores.platforms` includes `ios` → Sign in with Apple is **automatically enabled and required**.

Shippie:
- Adds Apple as an OAuth provider in the authorization UI
- Configures the iOS Capacitor build with Sign in with Apple capability
- Generates Apple Developer config (Service ID, Key ID)
- Fails the Ship to Stores build if SIWA isn't working

### 14.4 Compliance Checks as Code

Each check lives in `apps/web/lib/compliance/checks/` as a testable unit with a standardized interface:

```typescript
export type ComplianceResult =
  | { status: 'passed'; metadata?: Record<string, unknown> }
  | { status: 'failed'; reason: string; metadata?: object }
  | { status: 'pending'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | { status: 'needs_action'; reason: string; cta: { key: string; payload?: object } }

export const pass           = (m?: object): ComplianceResult => ({ status: 'passed', metadata: m })
export const fail           = (r: string, m?: object): ComplianceResult => ({ status: 'failed', reason: r, metadata: m })
export const pending        = (r: string): ComplianceResult => ({ status: 'pending', reason: r })
export const notApplicable  = (r: string): ComplianceResult => ({ status: 'not_applicable', reason: r })
export const needsAction    = (r: string, cta: { key: string; payload?: object }): ComplianceResult =>
  ({ status: 'needs_action', reason: r, cta })
```

Runs on every deploy + on every Ship to Stores trigger. Results stored in `compliance_checks` table. Submission is gated on all `required: true` checks passing (`passed` or `not_applicable`).

**Score treats `needs_action` like `failed` for blocking**, but the UI surfaces a CTA:

```typescript
// UI registry keyed on cta.key
const CTA_REGISTRY: Record<string, CtaRenderer> = {
  'download-ios-verify-kit': DownloadIosVerifyKitCta,
  // future CTAs
}
```

---

## Part 15 — Business Foundations

### 15.1 Organizations

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  plan text default 'free',              -- free | pro | team | business | enterprise
  billing_customer_id text,              -- Stripe
  verified_business boolean default false,
  verified_at timestamptz,
  verified_domain text,                  -- DNS TXT verified
  support_email text,
  privacy_policy_url text,
  terms_url text,
  data_residency text default 'eu',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table organization_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'developer', 'viewer', 'billing_manager')),
  invited_by uuid references users(id),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

create table organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references users(id),
  created_at timestamptz default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz default now()
);
create index audit_log_org_created_idx on audit_log (organization_id, created_at desc);
```

### 15.2 Roles + Permissions

| Role | Can |
|------|-----|
| `owner` | Everything, including billing + delete org |
| `admin` | Manage members, apps, secrets; can't delete org |
| `developer` | Create/edit apps, deploy, manage feedback, read/write per-app signing configs |
| `billing_manager` | Subscriptions, invoices, payment methods, read/write account credentials |
| `viewer` | Read-only access to dashboards + analytics |

Account credentials are billing-sensitive (owner/admin/billing_manager only). Per-app signing configs are dev-lifecycle (owner/admin/billing_manager/developer — viewers excluded).

### 15.3 Private / Internal Distribution

- `visibility_scope = 'private_org'` → only org members can access `{slug}.shippie.app`
- Worker checks session cookie against org membership via internal API
- `visibility_scope = 'private_link'` → anyone with the signed link can access (shareable for beta testers)
- Apps belong to an org OR a user via `apps.organization_id` / `apps.maker_id`

### 15.4 Billing + Subscriptions

Plans:

| Plan | Price | Who | Limits |
|------|-------|-----|--------|
| Free | $0 | Hobbyists | 3 apps, 10k function invocations/day, 100MB storage/app |
| Pro | $10/mo | Solo makers | 20 apps, 500k fn/day, 1GB storage/app, custom domains, store credentials, Ship to Stores |
| Team | $50/mo/org | Small teams | Unlimited apps, 5M fn/day, 10GB storage/app, private org apps, audit log export |
| Business | $200/mo/org | Businesses | SSO, DPA, verified business badge, white-label Ship to Stores, priority support |
| Enterprise | Custom | Large orgs | SCIM, SLA, dedicated Postgres, data residency choice, audit log retention |

**Pro is user-scoped.** Pro makers store credentials under `subject_type='user'`. Team and above use `subject_type='organization'`. An app owned by an org always resolves credentials against the org, never against the individual maker.

### 15.5 Trust Surfaces

Published at `shippie.app/trust/*`:
- `/subprocessors` — Cloudflare, Vercel, Hetzner, Resend, Stripe, OpenAI (opt-out for EU), Sentry (opt-out), GitHub, Apple, Google
- `/security` — 72-hour incident disclosure commitment, incident history
- `/dpa` — downloadable standard DPA based on EU SCCs
- `/compliance` — SOC2 roadmap, signed at launch

### 15.6 Data Residency

`organizations.data_residency` enforced at:
- Postgres writes routed to region-appropriate database
- R2 bucket region set at org creation
- Worker routing respects region affinity

---

## Part 16 — Moderation + Abuse Scaling

### 16.1 Moderation Queue

```sql
create table moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,               -- app | comment | feedback | user
  target_id uuid not null,
  report_id uuid references reports(id),
  classification text,                     -- spam | scam | nsfw | impersonation | other
  confidence float,
  status text default 'pending',
  assigned_to uuid references users(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);
```

Cron sweeps new reports every 5 min. Auto-classifies via keyword + pattern matching. Auto-actions: shadow-ban high-confidence spam, flag ambiguous for human review. Admin dashboard at `shippie.app/admin/moderation`.

### 16.2 Sock-Puppet + Vote Ring Detection

```sql
create table account_clusters (
  id uuid primary key default gen_random_uuid(),
  fingerprint_hash text unique not null,
  member_count int default 1,
  flagged boolean default false,
  created_at timestamptz default now()
);
```

- Disposable email providers → flagged
- IP + user agent clusters → associated
- Same cluster upvoting same apps → excluded from ranking
- Content similarity patterns → flagged
- Burst detection: >N upvotes in <M seconds → CAPTCHA required for next N votes
- Cross-correlation: recurring user/app co-occurrence → excluded from `leaderboard_snapshots`

### 16.3 Rate Limits

- Per user per app: 10 comments/hour, 3 bug reports/hour, 5 feature requests/hour
- Per IP: 50 anonymous actions/hour
- Enforced in Worker before proxying to platform

### 16.4 Comment Auto-Moderation

- Toxicity scoring via Perspective API (or self-hosted equivalent)
- Auto-hide above threshold; maker can unhide
- Repeated offenders auto-muted

---

## Part 17 — Leaderboards + Discovery

### 17.1 Ranking Engine

Hourly cron. Weighted per type:

**`app`**: 40% installs × 7d retention, 25% recent engagement (7d sessions), 15% feedback resolution rate, 10% launch velocity (deploys/feedback), 10% recency decay

**`web_app`**: 35% return visits, 25% sessions, 20% upvotes (decayed), 10% feedback resolution, 10% recency

**`website`**: 40% views (decayed), 30% upvotes, 20% recency, 10% feedback engagement

Maker/team actions discounted. Suspicious bursts flagged and excluded.

### 17.2 Shelves

Separate per type:
- `new_and_hot` — new + fast-rising
- `most_installed` — all-time installs
- `most_loved` — weighted rating + feedback resolution
- `rising` — week-over-week velocity
- `best_updated_week` — recent deploys + feedback resolution
- `trending` — rolling 24h signals

```sql
create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  shelf text not null,
  type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  rankings jsonb not null,
  created_at timestamptz default now()
);
create index leaderboard_shelf_type_period_idx on leaderboard_snapshots (shelf, type, period_end desc);
```

### 17.3 Unified Feedback

```sql
create table feedback_items (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id),
  type text not null check (type in ('comment', 'bug', 'request', 'rating', 'praise')),
  title text,
  body text,
  rating int check (rating between 1 and 5),
  dimensions jsonb,                       -- { usefulness: 5, design: 4, reliability: 5 }
  browser_info jsonb,
  device_info jsonb,
  screenshot_key text,
  repro_steps text,
  status text default 'open' check (status in (
    'open','acknowledged','planned','shipped','declined','duplicate','spam'
  )),
  duplicate_of uuid references feedback_items(id),
  maker_response text,
  maker_responded_at timestamptz,
  vote_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index feedback_items_app_type_status_idx on feedback_items (app_id, type, status);

create table feedback_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  feedback_id uuid not null references feedback_items(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, feedback_id)
);
```

One table serves comments, bugs, feature requests, ratings, and praise. Maker inbox renders typed views with dupe merging, status updates, and maker responses.

---

## Part 18 — Complete Data Model

All tables, consolidated. Assumes `create extension pg_trgm` and `create extension "uuid-ossp"` where needed.

### 18.1 Identity

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  email_verified timestamptz,
  github_id text unique,
  google_id text unique,
  apple_id text unique,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  verified_maker boolean default false,
  verification_source text,
  first_deploy_at timestamptz,
  first_deploy_duration_ms int,
  first_deploy_app_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auth.js tables via @auth/drizzle-adapter: accounts, sessions, verification_tokens
```

### 18.2 Apps

```sql
create table apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,
  type text not null check (type in ('app', 'web_app', 'website')),
  category text not null,
  icon_url text,
  theme_color text default '#000000',
  background_color text default '#ffffff',
  github_repo text,
  github_branch text default 'main',
  github_installation_id bigint,
  github_verified boolean default false,
  source_type text not null check (source_type in ('github', 'zip')),
  conflict_policy text default 'shippie',
  maker_id uuid not null references users(id),
  organization_id uuid references organizations(id) on delete cascade,
  visibility_scope text default 'public' check (visibility_scope in (
    'public', 'unlisted', 'private_org', 'private_link'
  )),
  is_archived boolean default false,
  takedown_reason text,

  -- Deploy pointers (derived, maintained by trigger)
  latest_deploy_id uuid,
  latest_deploy_status text,
  active_deploy_id uuid,
  preview_deploy_id uuid,

  -- Denormalized counters
  upvote_count int default 0,
  comment_count int default 0,
  install_count int default 0,
  active_users_30d int default 0,
  feedback_open_count int default 0,

  -- Ranking scores
  ranking_score_app double precision default 0,
  ranking_score_web_app double precision default 0,
  ranking_score_website double precision default 0,

  -- Readiness
  native_readiness_score int default 0,
  compatibility_score int default 0,
  native_readiness_report jsonb,
  best_on text check (best_on in ('mobile','desktop','any')),
  quick_ship_slo_hit boolean,

  -- Business
  support_email text,
  privacy_policy_url text,
  terms_url text,
  data_residency text default 'eu',
  screenshot_urls text[],

  first_published_at timestamptz,
  last_deployed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FTS + fuzzy search
alter table apps add column fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) stored;
create index apps_fts_idx on apps using gin(fts);
create index apps_trgm_idx on apps using gin(name gin_trgm_ops);
create index apps_slug_active_idx on apps (slug) include (active_deploy_id);

create table app_permissions (
  app_id uuid primary key references apps(id) on delete cascade,
  auth boolean default false,
  storage text default 'none',
  files boolean default false,
  notifications boolean default false,
  analytics boolean default true,
  external_network boolean default false,
  allowed_connect_domains text[] default array[]::text[],
  native_bridge_features text[] default array[]::text[],
  updated_at timestamptz default now()
);

create table reserved_slugs (
  slug text primary key,
  reason text not null,
  created_at timestamptz default now()
);
-- Seeded with: shippie, www, api, cdn, admin, mail, docs, help, status, blog,
-- about, app, trust, dashboard, security, ... + known brand trademarks
```

### 18.3 Deploys

```sql
create table deploys (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  version int not null,
  commit_sha text,
  source_type text not null,
  shippie_json jsonb,                     -- snapshot at deploy time
  changelog text,
  status text default 'building' check (status in (
    'building', 'needs_secrets', 'success', 'failed'
  )),
  build_log text,
  preflight_status text,                  -- passed | warned | blocked
  preflight_report jsonb,
  autopackaging_status text,              -- pending | partial | complete
  autopackaging_report jsonb,
  error_message text,
  duration_ms int,
  created_at timestamptz default now(),
  completed_at timestamptz,
  created_by uuid references users(id),
  unique (app_id, version)
);

create table deploy_artifacts (
  id uuid primary key default gen_random_uuid(),
  deploy_id uuid not null references deploys(id) on delete cascade,
  r2_prefix text not null,
  file_count int not null,
  total_bytes bigint not null,
  manifest jsonb not null,
  created_at timestamptz default now()
);

-- Trigger to maintain apps.latest_deploy_*
create or replace function sync_app_latest_deploy() returns trigger as $$
declare
  current_latest_version int;
begin
  select version into current_latest_version
    from deploys
   where id = (select latest_deploy_id from apps where id = NEW.app_id);

  update apps
     set latest_deploy_id     = NEW.id,
         latest_deploy_status = NEW.status,
         updated_at           = now()
   where id = NEW.app_id
     and (
       latest_deploy_id is null
       or latest_deploy_id = NEW.id                                -- same-row retry
       or coalesce(current_latest_version, -1) <= NEW.version     -- new or newer
     );

  return NEW;
end $$ language plpgsql;

create trigger deploys_sync_app_latest
  after insert or update of status on deploys
  for each row execute function sync_app_latest_deploy();
```

### 18.4 OAuth + Sessions

```sql
create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  client_id text unique not null,
  client_secret_hash text,
  redirect_uris text[] not null,
  allowed_scopes text[] not null,
  created_at timestamptz default now()
);

create table oauth_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  scope text[] not null,
  consented_at timestamptz default now(),
  revoked_at timestamptz,
  unique (user_id, app_id)
);

create table oauth_authorization_codes (
  code text primary key,
  client_id text not null references oauth_clients(client_id),
  user_id uuid not null references users(id),
  redirect_uri text not null,
  code_challenge text not null,
  scope text[] not null,
  expires_at timestamptz not null,
  used boolean default false
);

create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  handle_hash text unique not null,        -- SHA-256 of opaque handle
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  scope text[] not null,
  user_agent text,
  ip_hash text,
  device_fingerprint text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_from uuid references app_sessions(id)
);
create index app_sessions_user_app_idx on app_sessions (user_id, app_id) where revoked_at is null;
create index app_sessions_handle_idx on app_sessions (handle_hash) where revoked_at is null;
```

### 18.5 Multi-Tenant SDK Storage [RLS]

```sql
create table app_data (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  collection text not null,
  key text not null,
  data jsonb not null,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index app_data_private_unique
  on app_data (app_id, user_id, collection, key)
  where is_public = false;

create unique index app_data_public_unique
  on app_data (app_id, collection, key)
  where is_public = true;

create index app_data_app_user_idx on app_data (app_id, user_id, collection);

alter table app_data enable row level security;

create policy app_data_select on app_data
  for select using (
    app_id = current_setting('app.current_app_id')::uuid
    and (
      user_id = current_setting('app.current_user_id', true)::uuid
      or is_public = true
    )
  );

create policy app_data_write on app_data
  for all
  using (
    app_id = current_setting('app.current_app_id')::uuid
    and user_id = current_setting('app.current_user_id')::uuid
  )
  with check (
    app_id = current_setting('app.current_app_id')::uuid
    and user_id = current_setting('app.current_user_id')::uuid
  );

create table app_files (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  r2_key text unique not null,
  size_bytes int not null,
  mime_type text not null,
  created_at timestamptz default now()
);
-- Same RLS pattern as app_data
```

### 18.6 Shippie Functions

```sql
create table function_deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid not null references deploys(id) on delete cascade,
  worker_name text not null,
  bundle_hash text not null,
  allowed_domains text[] not null,
  env_schema jsonb not null,
  deployed_at timestamptz default now()
);

create table function_secrets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  key text not null,
  value_encrypted text not null,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (app_id, key)
);

create table function_logs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid references deploys(id),
  path text not null,
  method text not null,
  status int,
  duration_ms int,
  cpu_time_ms int,
  user_id uuid,
  error text,
  metadata jsonb,
  created_at timestamptz default now()
) partition by range (created_at);
-- Monthly partitions, 30d retention
```

### 18.7 Ship to Stores

```sql
-- Reusable, subject-scoped credentials (ASC API keys, Play service accounts)
create table store_account_credentials (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'organization')),
  subject_id uuid not null,
  platform text not null check (platform in ('ios', 'android')),
  credential_type text not null check (credential_type in (
    'asc_api_key',
    'play_service_account'
  )),
  label text not null,
  encrypted_value text not null,
  metadata jsonb,
  created_at timestamptz default now(),
  rotated_at timestamptz,
  unique (subject_type, subject_id, platform, credential_type, label)
);
create index sac_subject_idx on store_account_credentials (subject_type, subject_id, platform);

alter table store_account_credentials enable row level security;

create policy sac_user_rw on store_account_credentials
  for all
  using (
    subject_type = 'user'
    and subject_id = current_setting('app.current_user_id', true)::uuid
  )
  with check (
    subject_type = 'user'
    and subject_id = current_setting('app.current_user_id', true)::uuid
  );

create policy sac_org_rw on store_account_credentials
  for all
  using (
    subject_type = 'organization'
    and exists (
      select 1 from organization_members om
      where om.org_id  = store_account_credentials.subject_id
        and om.user_id = current_setting('app.current_user_id', true)::uuid
        and om.role in ('owner', 'admin', 'billing_manager')
    )
  )
  with check (
    subject_type = 'organization'
    and exists (
      select 1 from organization_members om
      where om.org_id  = store_account_credentials.subject_id
        and om.user_id = current_setting('app.current_user_id', true)::uuid
        and om.role in ('owner', 'admin', 'billing_manager')
    )
  );

-- Per-app signing configs
create table app_signing_configs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  account_credential_id uuid references store_account_credentials(id) on delete restrict,
  is_active boolean default true,
  version int not null default 1,

  -- iOS
  ios_bundle_id text,
  ios_team_id text,
  ios_signing_mode text check (ios_signing_mode in ('automatic', 'manual')),
  ios_certificate_r2_key text,
  ios_certificate_password_encrypted text,
  ios_provisioning_profile_r2_key text,
  ios_entitlements_plist_r2_key text,

  -- Android
  android_package text,
  android_keystore_r2_key text,
  android_keystore_password_encrypted text,
  android_key_alias text,
  android_key_password_encrypted text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references users(id)
);

-- Exactly one active per (app, platform)
create unique index app_signing_configs_active_unique
  on app_signing_configs (app_id, platform)
  where is_active = true;
create index app_signing_configs_app_platform_idx on app_signing_configs (app_id, platform);

alter table app_signing_configs enable row level security;

create policy asc_rw on app_signing_configs
  for all
  using (
    exists (
      select 1 from apps a
      where a.id = app_signing_configs.app_id
        and (
          (a.organization_id is null
            and a.maker_id = current_setting('app.current_user_id', true)::uuid)
          or (a.organization_id is not null
            and exists (
              select 1 from organization_members om
              where om.org_id  = a.organization_id
                and om.user_id = current_setting('app.current_user_id', true)::uuid
                and om.role in ('owner', 'admin', 'billing_manager', 'developer')
            ))
        )
    )
  )
  with check (
    exists (
      select 1 from apps a
      where a.id = app_signing_configs.app_id
        and (
          (a.organization_id is null
            and a.maker_id = current_setting('app.current_user_id', true)::uuid)
          or (a.organization_id is not null
            and exists (
              select 1 from organization_members om
              where om.org_id  = a.organization_id
                and om.user_id = current_setting('app.current_user_id', true)::uuid
                and om.role in ('owner', 'admin', 'billing_manager', 'developer')
            ))
        )
    )
  );

-- iOS verification tracking
create table ios_verify_kits (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid not null references app_signing_configs(id) on delete cascade,
  nonce text unique not null,
  secret text not null,                    -- encrypted at rest
  kit_version int not null,
  issued_to uuid not null references users(id),
  issued_at timestamptz default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumption_outcome text check (consumption_outcome in ('accepted', 'rejected')),
  rejection_reason text
);
create index ios_verify_kits_app_unused_idx
  on ios_verify_kits (app_id, signing_config_id)
  where consumed_at is null;

create table ios_signing_verifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid not null references app_signing_configs(id) on delete cascade,
  nonce text unique not null,
  succeeded_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  xcode_version text,
  macos_version text,
  log_r2_key text,
  verify_kit_version int not null,
  invalidated_at timestamptz,
  invalidated_reason text
);
create index ios_signing_verifications_active_idx
  on ios_signing_verifications (app_id, signing_config_id, succeeded_at desc)
  where invalidated_at is null;

-- Trigger: invalidate verifications on in-place identity edits
create or replace function invalidate_verifications_on_config_change()
returns trigger as $$
begin
  if NEW.platform <> 'ios' then return NEW; end if;

  if (
       coalesce(OLD.ios_team_id,          '') is distinct from coalesce(NEW.ios_team_id,          '')
    or coalesce(OLD.ios_bundle_id,        '') is distinct from coalesce(NEW.ios_bundle_id,        '')
    or coalesce(OLD.ios_signing_mode,     '') is distinct from coalesce(NEW.ios_signing_mode,     '')
    or coalesce(OLD.ios_certificate_r2_key,        '') is distinct from coalesce(NEW.ios_certificate_r2_key,        '')
    or coalesce(OLD.ios_provisioning_profile_r2_key,'') is distinct from coalesce(NEW.ios_provisioning_profile_r2_key,'')
    or coalesce(OLD.ios_entitlements_plist_r2_key, '') is distinct from coalesce(NEW.ios_entitlements_plist_r2_key, '')
  ) then
    update ios_signing_verifications
       set invalidated_at     = now(),
           invalidated_reason = format('config %s updated in place on version %s', NEW.id, NEW.version)
     where signing_config_id = NEW.id
       and invalidated_at is null;
  end if;

  return NEW;
end $$ language plpgsql;

create trigger app_signing_configs_invalidate_verifications
  after update on app_signing_configs
  for each row execute function invalidate_verifications_on_config_change();

-- Native bundles (built submission artifacts)
create table native_bundles (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  wrapper text not null check (wrapper in ('capacitor', 'twa')),
  version text not null,
  build_number int not null,
  bundle_id text not null,
  signed_artifact_r2_key text,
  readiness_score int,
  readiness_report jsonb,
  native_bridge_features text[],
  submission_status text default 'draft' check (submission_status in (
    'draft', 'building', 'ready', 'submitted', 'in_review',
    'approved', 'rejected', 'live', 'removed'
  )),
  rejection_reason text,
  store_connect_id text,
  play_console_id text,
  testflight_group text,
  play_track text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- Compliance
create table compliance_checks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios','android','both','web')),
  check_type text not null,
  status text not null check (status in (
    'passed',
    'failed',
    'pending',
    'not_applicable',
    'needs_action'
  )),
  evidence jsonb,
  checked_at timestamptz default now()
);
create index compliance_app_platform_idx on compliance_checks (app_id, platform);

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  requested_at timestamptz default now(),
  grace_period_ends_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz,
  unique (app_id, user_id)
);
comment on table account_deletion_requests is
  'Populated only when an app retains user data. Stateless apps never have rows here. Compliance runner enforces applicability via shippie.json + static analysis.';

create table privacy_manifests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid references deploys(id),
  collected_data jsonb not null,
  accessed_apis jsonb not null,
  tracking_enabled boolean default false,
  tracking_domains text[],
  data_safety_android jsonb not null,
  generated_at timestamptz default now(),
  source text
);

create table app_external_domains (
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid not null references deploys(id) on delete cascade,
  domain text not null,
  source text not null,
  allowed boolean not null,
  first_seen_at timestamptz default now(),
  primary key (app_id, deploy_id, domain)
);
```

### 18.8 Organizations + Billing

```sql
create table organizations (...);           -- See §15.1
create table organization_members (...);
create table organization_invites (...);
create table audit_log (...);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user','organization')),
  subject_id uuid not null,
  plan text not null,
  status text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  app_id uuid references apps(id),
  metric text not null,                    -- fn_invocation | storage_bytes | deploy | bandwidth
  value bigint not null,
  created_at timestamptz default now()
) partition by range (created_at);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id),
  stripe_invoice_id text unique,
  amount_cents int not null,
  currency text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  pdf_r2_key text,
  created_at timestamptz default now()
);

create table app_quotas (
  app_id uuid primary key references apps(id) on delete cascade,
  tier text default 'free',
  storage_rows_used int default 0,
  storage_rows_limit int default 10000,
  storage_bytes_used bigint default 0,
  storage_bytes_limit bigint default 100_000_000,
  files_count_used int default 0,
  files_count_limit int default 500,
  events_today int default 0,
  events_today_limit int default 100000,
  deploys_today int default 0,
  deploys_today_limit int default 100,
  updated_at timestamptz default now()
);
```

### 18.9 Social, Feedback, Moderation, Analytics

```sql
create table upvotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, app_id)
);

create table device_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  device_fingerprint text,
  platform text,
  install_prompt_shown_at timestamptz,
  a2hs_confirmed_at timestamptz,
  display_mode_standalone_seen_at timestamptz,
  launched_from_home_screen_count int default 0,
  last_launched_at timestamptz,
  uninstalled_at timestamptz,
  created_at timestamptz default now()
);

create table feedback_items (...);          -- See §17.3
create table feedback_votes (...);

create table reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  feedback_id uuid references feedback_items(id) on delete cascade,
  reporter_id uuid references users(id),
  reason text not null,
  details text,
  status text default 'open',
  created_at timestamptz default now()
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  reason text,
  moderator_id uuid references users(id),
  created_at timestamptz default now()
);

create table moderation_queue (...);        -- See §16.1
create table account_clusters (...);        -- See §16.2
create table leaderboard_snapshots (...);   -- See §17.1

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id),
  session_id text,
  event_name text not null,
  event_data jsonb,
  created_at timestamptz default now()
) partition by range (created_at);
-- Monthly partitions, 90d retention, hourly rollup to analytics_daily

create table analytics_daily (
  app_id uuid not null references apps(id) on delete cascade,
  day date not null,
  event_name text not null,
  count int not null default 0,
  unique_users int not null default 0,
  primary key (app_id, day, event_name)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now(),
  unique (user_id, app_id, endpoint)
);

create table notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id),
  title text not null,
  body text not null,
  scheduled_for timestamptz default now(),
  sent_at timestamptz,
  status text default 'pending'
);
```

### 18.10 Migration Order

```
0001_init.sql                    (users, apps, deploys, app_data, RLS baseline, reserved_slugs)
0002_oauth_sessions.sql          (oauth_*, app_sessions, app_data WITH CHECK)
0003_functions_business.sql      (function_*, organizations, orgs members, audit_log, subscriptions)
0004_ship_to_stores.sql          (store_account_credentials, app_signing_configs, native_bundles,
                                  compliance_checks, account_deletion_requests, privacy_manifests,
                                  app_external_domains)
0005_ios_verification.sql        (ios_verify_kits, ios_signing_verifications, trigger,
                                  expanded compliance_checks.status enum)
0006_feedback_moderation.sql     (feedback_items, feedback_votes, reports, moderation_*,
                                  leaderboard_snapshots, account_clusters)
0007_analytics.sql               (analytics_events partitioned, analytics_daily,
                                  push_subscriptions, notifications_outbox)
```

---

## Part 19 — Project Structure

```
shippie/
├── apps/
│   └── web/                              # Next.js 16 — control plane → Vercel
│       ├── app/
│       │   ├── new/                      # First-time maker hero
│       │   ├── (marketing)/
│       │   ├── (storefront)/             # Browse, search, leaderboards per type
│       │   │   └── apps/[slug]/          # Detail, install, feedback, trust
│       │   ├── (dashboard)/              # Maker dashboard
│       │   │   ├── apps/
│       │   │   │   └── [slug]/
│       │   │   │       ├── stores/       # Ship to Stores (readiness, iOS, android)
│       │   │   │       ├── compliance/
│       │   │   │       ├── functions/    # Secrets, logs
│       │   │   │       ├── feedback/
│       │   │   │       ├── analytics/
│       │   │   │       └── deploys/[version]/   # Unified deploy report
│       │   │   ├── billing/
│       │   │   └── orgs/[slug]/
│       │   │       ├── billing/
│       │   │       └── audit-log/
│       │   ├── (auth)/
│       │   ├── oauth/                    # /authorize, /consent UI
│       │   ├── admin/                    # Moderation, SLO dashboard
│       │   ├── trust/                    # Public trust surfaces
│       │   │   ├── subprocessors/
│       │   │   ├── security/
│       │   │   ├── dpa/
│       │   │   └── compliance/
│       │   └── api/
│       │       ├── auth/                 # Auth.js routes
│       │       ├── oauth/
│       │       │   ├── token/            # POST /oauth/token
│       │       │   └── consents/
│       │       ├── v1/                   # Phase 2 public API
│       │       ├── internal/             # Worker ↔ Platform signed endpoints
│       │       │   ├── session/
│       │       │   │   └── authorize/
│       │       │   ├── version/
│       │       │   ├── sdk/
│       │       │   │   ├── storage/
│       │       │   │   ├── files/
│       │       │   │   ├── analytics/
│       │       │   │   └── feedback/
│       │       │   ├── install/
│       │       │   ├── ios-signing-verify/   # Verify kit callback (§13)
│       │       │   └── functions/
│       │       │       └── invoke-log/
│       │       ├── webhooks/
│       │       │   ├── github/
│       │       │   └── stripe/
│       │       ├── deploy/               # Trigger Sandbox build
│       │       ├── stores/               # Ship to Stores orchestration
│       │       ├── billing/
│       │       ├── admin/
│       │       ├── orgs/
│       │       └── cron/
│       │           ├── ranking/
│       │           ├── screenshots/
│       │           ├── autopack/
│       │           ├── domain-rescan/
│       │           ├── quota-reset/
│       │           └── account-deletion-sweep/
│       ├── middleware.ts                 # Signed-request verification, rate limit
│       ├── lib/
│       │   ├── db/                       # Drizzle client + PgBouncer pool
│       │   ├── auth/                     # Auth.js config
│       │   ├── oauth/                    # OAuth server logic
│       │   ├── session/                  # Opaque handle generation + lookup
│       │   ├── sandbox/                  # Vercel Sandbox client
│       │   ├── r2/
│       │   ├── preflight/
│       │   │   ├── slug.ts
│       │   │   ├── reserved-paths.ts
│       │   │   ├── manifest-conflict.ts
│       │   │   ├── static-analysis.ts
│       │   │   ├── malware-scan.ts
│       │   │   ├── package-age.ts
│       │   │   └── functions-analysis.ts # Static analyzer for Functions bundles
│       │   ├── build/
│       │   │   ├── detect-pm.ts
│       │   │   ├── detect-framework.ts
│       │   │   └── detect-ai-tool.ts
│       │   ├── pwa-injector/
│       │   ├── auto-package/
│       │   │   ├── icon.ts
│       │   │   ├── screenshots.ts        # Web + store sizes in one pipeline
│       │   │   ├── copy.ts
│       │   │   ├── compat-report.ts
│       │   │   └── og-card.ts
│       │   ├── quick-ship/
│       │   │   ├── auto-draft-config.ts
│       │   │   ├── auto-generate-icon.ts
│       │   │   └── auto-detect-framework.ts
│       │   ├── functions/                # CFW4P orchestration
│       │   │   ├── bundler.ts
│       │   │   ├── cfw4p.ts
│       │   │   ├── secrets.ts
│       │   │   └── shim.ts
│       │   ├── stores/                   # Ship to Stores
│       │   │   ├── capacitor-project.ts
│       │   │   ├── twa-project.ts
│       │   │   ├── ios-prep-kit.ts
│       │   │   ├── android-build.ts
│       │   │   ├── play-console.ts
│       │   │   ├── app-store-connect.ts  # Phase 3
│       │   │   ├── signing.ts            # resolveSigningConfig, rotateSigningConfig
│       │   │   ├── verify-kit.ts         # recordRejection (atomic idempotent)
│       │   │   └── verify-kit-template.ts # Script template with -allowProvisioningUpdates
│       │   ├── compliance/
│       │   │   ├── runner.ts
│       │   │   ├── checks/
│       │   │   │   ├── ios-signing-config-registered.ts
│       │   │   │   ├── ios-signing-verified.ts
│       │   │   │   ├── account-deletion.ts
│       │   │   │   ├── privacy-manifest.ts
│       │   │   │   ├── data-safety.ts
│       │   │   │   ├── siwa-enforcement.ts
│       │   │   │   └── ...
│       │   │   ├── privacy-manifest.ts   # Generator
│       │   │   ├── data-safety.ts        # Generator
│       │   │   └── domain-scan.ts
│       │   ├── trust/
│       │   │   ├── source-provenance.ts
│       │   │   ├── domain-scan.ts
│       │   │   ├── permission-enforce.ts
│       │   │   └── csp-builder.ts
│       │   ├── billing/
│       │   │   ├── stripe.ts
│       │   │   ├── metering.ts
│       │   │   ├── invoices.ts
│       │   │   └── plans.ts
│       │   ├── moderation/
│       │   │   ├── auto-classify.ts
│       │   │   ├── sock-puppet.ts
│       │   │   ├── vote-ring.ts
│       │   │   └── queue.ts
│       │   ├── onboarding/
│       │   │   ├── detect.ts
│       │   │   ├── preview-card.ts
│       │   │   └── slo.ts
│       │   ├── github/
│       │   ├── ranking/
│       │   └── orgs/
│       ├── components/
│       └── vercel.ts
│
├── packages/
│   ├── sdk/                              # @shippie/sdk
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── auth.ts
│   │   │   ├── db.ts
│   │   │   ├── files.ts
│   │   │   ├── feedback.ts
│   │   │   ├── analytics.ts              # Enforces identifiable_analytics flag at runtime
│   │   │   ├── install.ts
│   │   │   ├── notify.ts
│   │   │   └── native/                   # Shippie Native Bridge
│   │   │       ├── index.ts
│   │   │       ├── share.ts
│   │   │       ├── haptics.ts
│   │   │       ├── device-info.ts
│   │   │       ├── notifications.ts
│   │   │       ├── deep-link.ts
│   │   │       ├── app-review.ts
│   │   │       └── detect.ts             # Capacitor presence detection
│   ├── functions-runtime/                # @shippie/functions
│   │   └── src/
│   ├── native-bridge/                    # Capacitor plugin shims
│   │   └── src/plugins/
│   ├── db/                               # Drizzle schema + migrations
│   │   ├── schema/
│   │   └── migrations/
│   ├── session-crypto/                   # Shared session handle hashing
│   │   └── src/
│   └── shared/                           # Types, constants, shippie.json schema
│
├── services/
│   └── worker/                           # CF Worker — runtime plane
│       ├── src/
│       │   ├── index.ts
│       │   ├── router/
│       │   │   ├── files.ts              # Serve R2 files with Cache API
│       │   │   ├── system.ts             # __shippie/* dispatcher
│       │   │   ├── sdk.ts
│       │   │   ├── manifest.ts
│       │   │   ├── sw.ts
│       │   │   ├── icons.ts
│       │   │   ├── auth.ts
│       │   │   ├── session.ts
│       │   │   ├── storage.ts
│       │   │   ├── files-proxy.ts
│       │   │   ├── analytics.ts
│       │   │   ├── feedback.ts
│       │   │   ├── install.ts
│       │   │   ├── health.ts
│       │   │   ├── meta.ts
│       │   │   └── fn.ts                 # Dispatch to CFW4P user Workers
│       │   ├── kv/
│       │   │   ├── app-config.ts
│       │   │   └── session.ts
│       │   ├── session/
│       │   │   ├── cookie.ts
│       │   │   └── resolve.ts
│       │   ├── platform-client.ts        # HMAC-signed platform API calls
│       │   ├── html-rewriter.ts          # Runtime PWA injection fallback
│       │   └── version.ts                # Version pointer read-through cache
│       └── wrangler.toml
│
├── infra/
│   ├── hetzner/
│   │   ├── setup.sh                      # Postgres + PgBouncer install
│   │   ├── postgres.conf
│   │   └── pgbouncer.ini
│   ├── cloudflare/
│   │   ├── dns-notes.md
│   │   ├── tunnel-setup.md
│   │   ├── cfw4p-setup.md
│   │   └── durable-objects.md
│   ├── github-app/
│   │   └── manifest.json
│   └── stripe/
│       └── products.md
│
├── docs/
│   ├── shippie-json-spec.md
│   ├── sdk-reference.md
│   ├── functions-guide.md
│   ├── native-bridge.md
│   ├── ship-to-stores.md
│   ├── orgs-and-roles.md
│   ├── trust-model.md
│   ├── security.md                       # Full honest iOS verification framing
│   ├── conflict-policies.md
│   └── compliance-model.md
│
├── turbo.json
├── package.json
└── README.md
```

---

## Part 20 — 14-Week Build Plan

### Week 1 — Foundation
- Monorepo: Next.js 16 + Drizzle + Auth.js v6 + Turborepo (Bun workspaces)
- Vercel project linked, preview URL setup
- Hetzner VPS: Postgres 16 + PgBouncer + Cloudflare Tunnel to Vercel
- Migrations 0001–0003 (core schema, OAuth, functions, business foundations including `billing_manager` role)
- Auth.js with GitHub + Google + Apple providers
- Platform layout shell + marketing landing
- `packages/session-crypto` with SHA-256 + HMAC primitives
- DNS: `shippie.app`, `*.shippie.app`, `cdn.shippie.app`, Advanced Certificate Manager wildcard cert
- Seed `reserved_slugs`

### Week 2 — Worker Runtime + Onboarding Flow
- Cloudflare Worker scaffold with `*.shippie.app/*` wildcard route
- KV namespaces + Durable Object for version broadcast
- Serve files from R2 with Cache API + SPA fallback
- Postgres source-of-truth version pointer + KV read-through
- `__shippie/sdk.js`, `__shippie/manifest`, `__shippie/sw.js`, `__shippie/icons/*`, `__shippie/meta`, `__shippie/health`
- HTMLRewriter runtime PWA injection fallback
- Atomic version pointer swap + rollback endpoint
- **First-time maker flow**: `shippie.app/new` with inline GitHub repo picker, auto-detection pipeline, preview card UX
- First-deploy instrumentation (`users.first_deploy_*`, SLO dashboard stub)

### Week 3 — Deploy Pipeline (Static + Quick Ship + Auto-Remediation)
- New Project form (+ deploy_mode selector)
- Zip upload → R2 staging → preflight → build (static skip) → PWA inject → upload → publish
- Preflight: slug rules, reserved paths (**hard block**), manifest conflicts, size limits, package-age, secret leakage, malware
- Build contract: `detect-pm`, `detect-framework`, `detect-ai-tool`
- Quick Ship default; Preview as opt-in
- **Auto-remediation** (auto-draft shippie.json, auto-icon, framework fallback) runs **before** preflight hard-blocks
- Deploy status page with live SSE logs
- Ship 5–10 static tools you build yourself

### Week 4 — Auth (Opaque Handle Model)
- Platform OAuth server: `/oauth/authorize`, `/api/oauth/token`, PKCE verification
- `app_sessions` with opaque handles + device tracking
- Worker: `/__shippie/auth/login`, `/auth/callback`, `/auth/logout`, `/session`
- Worker session resolution via signed `/api/internal/session/authorize`
- User dashboard: "Apps with access" + per-device revocation
- Cross-device sign-in via QR handoff

### Week 5 — SDK Core + Storage
- `@shippie/sdk` package scaffold; same-origin fetch wrapper
- `shippie.auth.*`, `shippie.db.*`, `shippie.feedback.*`, `shippie.analytics.*`, `shippie.install.*`, `shippie.meta()`
- Platform internal endpoints with signed-request verification + RLS session vars
- Quota enforcement with 429
- Build 3–4 stateful apps using the SDK (recipe, habit, workout, mood journal)
- Publish `@shippie/sdk` v1.0.0 to npm, CDN, and same-origin proxy

### Week 6 — GitHub App + Vercel Sandbox Builds
- GitHub App registration + install flow + webhook handlers
- Repo connection UI
- Vercel Sandbox integration: clone, install with detected PM, `--ignore-scripts`, build, extract
- Live build log streaming (SSE)
- Build cache (node_modules tarball keyed by lockfile hash)
- Full `shippie.json` support
- Auto-deploy on push

### Week 7 — Shippie Functions (MVP) + `needs_secrets` State
- CFW4P dispatch namespace setup
- Function bundler (esbuild) + runtime shim (fetch allowlist, ctx.env, ctx.db, ctx.log)
- Secret storage (AES-GCM), secret injection at deploy time
- `__shippie/fn/*` routing in Worker
- `needs_secrets` deploy state (same-row retry semantics, trigger-maintained `apps.latest_*`)
- Function logs via Tail Worker → Postgres `function_logs` (partitioned)
- Example apps: Stripe subscription demo, OpenAI chat demo
- Docs: `functions-guide.md`

### Week 8 — Auto-Packaging Layer (Web + Store Sizes)
- Screenshot capture job (headless Chrome) — web + iOS + Android sizes in one pass
- Icon auto-fallback pipeline + AI-generated fallback (feature-flagged, cost-capped)
- Listing copy generator (AI)
- Compatibility report
- OG social card generation
- Trigger pipeline on every deploy (async, non-blocking for Quick Ship)

### Week 9 — Trust Enforcement + Compliance Runner
- Static AST walk for external fetch targets
- Runtime CSP builder per app
- ClamAV integration in Sandbox
- Permission-to-runtime enforcement in SDK endpoints
- Source provenance checks (GitHub App install + commit owner match)
- Privacy policy / support email requirements for public listings
- `lib/compliance/runner.ts` + checks as code
- Privacy Manifest + Android Data Safety generators
- **`__shippie/fn/_account_delete` reserved route**
- Sign in with Apple enforcement logic
- **Functions static analyzer** for stateless proof (fail-closed default)

### Week 10 — Discovery, Feedback, Moderation
- Storefront feeds per type (app / web_app / website)
- Full-text search with FTS + pg_trgm
- Ranking engine: hourly cron, weighted per type, burst detection
- Leaderboard shelves: new_and_hot, most_installed, most_loved, rising, best_updated_week
- App detail page: hero, install UX (Android + iOS), screenshots, maker info, trust card, permissions, changelog, feedback summary, QR
- Unified `feedback_items` + maker inbox with dupe merging + status updates
- Reports + moderation queue + auto-classifier + sock-puppet/vote-ring detection
- Rate limits

### Week 11 — Orgs + Business Operations
- Org creation, members, invites, roles (including `billing_manager`)
- Audit log writes on all sensitive actions
- Apps belong to org or user (`visibility_scope`)
- Private-org app access check in Worker
- Org dashboard
- Verified Business DNS check (manual admin approval at launch)
- **Stripe integration**: products, checkout, subscriptions, webhooks, invoices portal
- Plans: Free / Pro / Team / Business / Enterprise with billing_manager role
- **Usage metering** + overage UX
- **DPA auto-generation** + public subprocessor page + security incident policy
- Data residency enforcement at all three layers

### Week 12 — Shippie Native Bridge + Launch Polish
- `@shippie/sdk/native` package with Phase 1 APIs: `share`, `haptics`, `deviceInfo`, `deepLink`, `appReview`, `notifications`, `clipboard`, `appState`
- Web fallbacks + Capacitor detection
- Unified deploy report page
- Public trust surfaces live
- Seed apps across all three types

### Week 13 — Ship to Stores (Android Automation + iOS Verification + Prep Kit)
- **Native Readiness Score** computation + dashboard
- Store-readiness gate UI (locked until score ≥85)
- **Android pipeline**:
  - Capacitor project generation + Bubblewrap TWA path
  - Gradle build in Vercel Sandbox
  - Play Console API integration
  - Internal track submission live
- **iOS Prep Kit + Verification**:
  - Capacitor project generation with full iOS config + PrivacyInfo.xcprivacy + SIWA capability
  - `shippie ios-verify` kit with `-allowProvisioningUpdates` + real `clean build`
  - `ios_verify_kits` + `ios_signing_verifications` + invalidation trigger
  - Callback handler: body/kit binding, row-lock transaction, atomic consume-if-unconsumed, log marker check
  - `ios-signing-config-registered` + `ios-signing-verified` checks (both `required`, manual-static vs automatic-token)
  - `rotateSigningConfig` helper with app-level invalidation
  - Dashboard: "Download verify kit" CTA + Verify history panel
  - iOS **Production track + Shippie-managed signing labelled "Phase 2 / 3 — coming soon" and disabled**
- `store_account_credentials` + `app_signing_configs` tables with RLS

### Week 14 — Launch
- Landing page polish, value prop demo video, "apps on your phone" messaging
- Seed 20–30 apps across all three types + 3–5 with Functions + 2–3 with Ship to Stores active
- SEO: dynamic OG images, meta tags, sitemap, robots.txt
- `shippie.app` itself installable as PWA
- Production deploy + smoke tests
- Beta invites: 30 makers from vibe-coding communities
- Monitoring (Sentry, uptime, DB backups automation)
- Public changelog + roadmap
- Launch post

---

## Part 21 — Edge Cases (Exhaustive)

| # | Case | Mitigation |
|---|------|-----------|
| 1 | Slug squatting / brand impersonation | `reserved_slugs` seeded; trademark check on new deploys; admin reassignment flow |
| 2 | Reserved `__shippie/*` collision in maker files | **Hard preflight block** with named files and rename instructions |
| 3 | Maker ships own `manifest.json` / `sw.js` | `conflict_policy` in shippie.json (shippie/merge/own) |
| 4 | SSR/server code in a static type | Preflight detects Next.js API routes, fs writes, server-only imports; warns or blocks |
| 5 | Monorepo with two shippable apps | Detect `shippie.json` in subdirs; each deploys as a separate app |
| 6 | Build output missing index.html | Validator rejects (unless type=website) |
| 7 | Huge images / source maps | 200MB bundle limit; Pro tier higher |
| 8 | Env vars build-time vs client | `env_build` allowlist; server-only vars never shipped client-side |
| 9 | App needs secret for external API | **Shippie Functions** — declare in shippie.json, set via dashboard, injected at runtime |
| 10 | Popup blocked during signIn | Fallback to full-page redirect with return_to |
| 11 | Safari iOS standalone differences | Detect via `display-mode`; iOS-specific cookie handling; no `beforeinstallprompt` |
| 12 | iOS 7-day storage clear | SW re-registration; warn if `last_seen_at > 5d` |
| 13 | Malicious feedback spam / brigading | Rate limits + sock-puppet clustering + vote ring detection + shadow-ban |
| 14 | Bad deploy shipped to live users | Atomic pointer swap = 1-click rollback; auto-rollback on error rate spike |
| 15 | App deletion while users have it installed | 30d grace + banner + data export; then permanent; subdomain returns 410 |
| 16 | App renamed / slug changed after installs | Admin-approved; old slug redirects for 90 days |
| 17 | Multi-device session revocation | `app_sessions` lists devices; revoke individually or all |
| 18 | Desktop → mobile handoff | QR code on every install surface |
| 19 | Refresh token reuse attack | Session handle rotation + reuse detection → revoke all sessions for user+app |
| 20 | CSP violation from maker code | Worker sets CSP; `allowed_connect_domains` in shippie.json; violations logged |
| 21 | Preflight false negative (malicious postinstall) | `--ignore-scripts` + 72h quarantine + Vercel Sandbox microVMs |
| 22 | Build timeout (infinite loop) | 10min hard timeout + CPU/RAM limits |
| 23 | Quota exhaustion | 429 with clear error; maker dashboard shows quota; upgrade path |
| 24 | Concurrent writes to same `app_data` key | Partial unique indexes; UPSERT; last-write-wins with `updated_at` |
| 25 | Analytics volume explodes | Monthly partition + 90d TTL + hourly rollups; per-app event rate limit |
| 26 | Service worker stuck on old version | Version-named caches; network-first HTML; refresh banner |
| 27 | Takedown while app is in home screen | 410 Gone with maker contact; SW fetches fail gracefully |
| 28 | GitHub repo renamed / deleted | Webhook detects; app moves to `takedown` pending maker action |
| 29 | Maker account deleted | Apps archived; 30d grace; data export emailed |
| 30 | Fake installs inflation | Device fingerprint + heuristic validation (a2hs_confirmed + standalone_seen before counted) |
| 31 | Native module build failure | Preflight warns; build log surfaces clearly |
| 32 | Unverified maker impersonation | Public "unverified" badge; verified requires GitHub App install + owner match |
| 33 | User revokes consent mid-session | `oauth_consents.revoked_at` checked; next request 401; app prompts re-consent |
| 34 | Cookie domain mismatch on custom domains (Phase 2) | Session binds to canonical host; custom domain gets fresh session via OAuth |
| 35 | Worker KV replication lag on version swap | Postgres is source of truth; DO broadcast invalidates cache; fall-through to platform API |
| 36 | Function exceeds CPU/memory | 50ms CPU / 128MB hard limit, 503 + logged |
| 37 | Function calls non-allowlisted domain | Wrapped fetch returns 403, logged, deploy flagged |
| 38 | Function secret rotation mid-traffic | CFW4P re-deploy with new env; old Worker drains then terminates |
| 39 | Auth cookie theft via XSS | Opaque handle only; server-side lookup enforces scope + revocation; blast radius = one session |
| 40 | Session cache staleness on revoke | KV cache TTL ≤60s; immediate DO broadcast |
| 41 | KV and DB diverge on version pointer | DB is source of truth; Worker falls through to platform API on cache miss |
| 42 | Quick Ship blows up from bad deploy | Instant rollback via pointer swap; auto-rollback if error rate >N% in first 10min |
| 43 | Quick Ship publishes incomplete metadata | Auto-packaging fills gaps async; missing items show "pending" in listing |
| 44 | AI-generated icon is bad | Maker can regenerate or upload; non-blocking |
| 45 | Missing README for copy generation | Fall back to name + type; surface "add a description" hint |
| 46 | pnpm workspace protocol references | Handled by pnpm install; no-op for us |
| 47 | Bun-specific APIs in non-Bun framework | Detected and warned; build fails with clear error |
| 48 | Org member leaves — session continuity | Org membership checked on every request; next request → 403 + re-auth |
| 49 | Private-org app accessed by non-member | Worker returns 404 (not 403) to avoid enumeration |
| 50 | Verified Business domain expires | Cron re-checks; badge removed; org notified |
| 51 | Audit log tampering | Append-only table, no UPDATE/DELETE grants; backups + checksums |
| 52 | Malware scanner false positive | Maker submits appeal; admin override with audit log entry |
| 53 | External domain list too restrictive | Dashboard shows blocked fetches in real time; maker adds domain + redeploys |
| 54 | Role escalation attempt | Role changes only by admins+owners; audit logged; invite tokens single-use |
| 55 | Functions-based data retention bypass | Static analyzer fails closed — maker must prove statelessness, cannot declare it |
| 56 | iOS verification stale after rotation | Rotation invalidates via app-level + DB trigger on identity edits |
| 57 | iOS verification for wrong config via client tampering | Callback binds body to kit's canonical config server-side |
| 58 | Duplicate concurrent verify callbacks | Row lock + atomic consume-if-unconsumed; exactly one verification per kit |
| 59 | Rotation race with in-flight verify | `SELECT FOR UPDATE` blocks rotation; either rotation catches new verification via app-level invalidation, or verify sees `is_active=false` and 409s |
| 60 | In-place edit of signing identity fields | DB trigger fires on identity-field change; invalidates prior verifications |
| 61 | Automatic signing CLI fails for legit setup | `-allowProvisioningUpdates` + diagnostic messages for "No Accounts" / "not a member of team" / "Failed to register bundle identifier" |

---

## Part 22 — Key Risks (Ranked)

1. **iOS store approval failures** (HIGH) — first app rejected is bad PR. Mitigated by Native Bridge + score gate + explicit "use ≥1 native feature" requirement.
2. **Compliance automation false positives** (HIGH) — bad privacy manifest gets an app rejected. Every check has integration tests; manual override available.
3. **Shippie Functions security** (HIGH) — untrusted code running on our infra. CFW4P V8 isolation + outbound allowlist + rate limits + static analysis fail-closed.
4. **Preflight completeness** (HIGH) — missing a check ships a hole. Preflight as its own test suite with 60+ cases.
5. **Quick Ship SLO miss** (MEDIUM) — slow time-to-live loses makers. Instrument day 1; alert on weekly regression.
6. **Vercel Sandbox regional limits** (MEDIUM) — US-East only; EU makers see slower builds.
7. **Ranking formula gaming** (MEDIUM) — launch conservative; adjust after 30d.
8. **Cold-start marketplace** (MEDIUM) — 20+ seed apps + targeted recruiting.
9. **Store credentials handling** (MEDIUM) — leaked Apple key or Android keystore is catastrophic. AES-GCM at rest, HSM-backed in Phase 2.
10. **Moderation at scale** (MEDIUM) — auto-mod false positives kill legitimate feedback. Appeals process.
11. **Postgres multi-tenant scaling** (LOW for MVP) — fine until ~1000 apps / 10M rows.
12. **iOS PWA limitations** (LOW but visible) — no bg sync, no aggressive install. Transparent in dashboard.
13. **Billing complexity / plan confusion** (LOW) — clear pricing page, one-sentence value per tier.

---

## Part 23 — Verification Plan

End-to-end checks run before launch.

1. **Static zip deploy** → live in <60s, manifest+SW+SDK auto-injected
2. **Vite React from GitHub** → live with PWA features in <3min, Quick Ship SLO hit
3. **pnpm/yarn/bun alternatives** → detected correctly, builds succeed
4. **Astro / Nuxt / SvelteKit / Remix static** → each detected and built
5. **Install to phone (Android)** → `beforeinstallprompt` prompt, installed, opens fullscreen, SW cached
6. **Install to phone (iOS)** → custom A2HS banner shown, installs, persists data
7. **Sign in** → `shippie.auth.signIn()` triggers OAuth, app-origin session cookie set, `getUser()` returns user
8. **Same-origin SDK storage** → `set/get/list/delete` all work, public/private isolation enforced
9. **Cross-app data isolation** → malicious app deployed as `evil.shippie.app` cannot read `recipes.shippie.app` data (RLS blocks)
10. **Session cookie theft resistance** → XSS in maker code cannot read `__shippie_session` (httpOnly)
11. **Device revocation** → sign in on two devices, revoke one, that device's next request 401 within 60s
12. **Rollback** → deploy v2, rollback to v1, Postgres + KV + DO broadcast all reflect change within 3s
13. **Preflight blocks `__shippie/` collision** → zip containing `__shippie/sdk.js` → rejected with clear error
14. **Preflight blocks postinstall attack** → malicious package → blocked by `--ignore-scripts`
15. **Build timeout** → infinite-loop build → killed at 10min
16. **Quota exhaustion** → 10001st row in app_data → 429 with error
17. **Service worker update** → redeploy → user gets refresh banner on next open
18. **Leaderboard ranking** → fake upvote burst → flagged, excluded
19. **Feedback flow** → submit bug, vote, maker responds, changelog reflects
20. **QR install handoff** → scan on desktop → phone install → works
21. **Slug squatting blocked** → `admin`, `shippie`, known brands → rejected
22. **GDPR export** → request export → email delivered with JSON across all apps
23. **Shippie Function invocation** → Stripe demo, OpenAI demo work end-to-end
24. **Function outbound allowlist** → non-allowlisted fetch → 403 + log
25. **Function CPU limit** → infinite loop function → 503 at 50ms
26. **`needs_secrets` deploy** → deploys with missing secret enters state, non-fn features work, setting secret resumes same deploy row
27. **Auto-packaging screenshots** → deploy without screenshots → capture job populates within 2min, web+store sizes both present
28. **AI icon fallback** → deploy without icon → fallback icon on detail page
29. **Org creation + invite** → create org, invite by email, accept, role enforced
30. **Private-org app** → non-member 404, member loads
31. **Audit log write** → publish app → `audit_log` row with actor + action + target
32. **Version consistency** → Postgres, KV, DO broadcast all reflect within 3s
33. **Permission-to-runtime** → call `shippie.files.upload` from app declaring `files: false` → 403 + compat report flag
34. **External domain rescan** → redeploy with new fetch target → rescan flags it
35. **Verified business flow** → create org, DNS TXT verify, badge appears
36. **Native Readiness score** → computed on deploy, visible on dashboard
37. **iOS signing config registered** — manual mode verifies mobileprovision plist (team, bundle, expiry); missing cert/profile blocks
38. **iOS verify kit download** — dashboard issues kit, `ios_verify_kits` row created with encrypted secret + nonce + 14-day expiry
39. **iOS verify kit runs** — `shippie ios-verify` executes real `clean build` with `-allowProvisioningUpdates`, uploads gzipped log + HMAC
40. **iOS verify callback happy path** — body/kit binding passes, HMAC check passes, log markers found, row lock + atomic consume + insert succeeds, readiness gate unblocks
41. **iOS verify callback tampered signing_config_id** → 403 "mismatch with kit", kit rejected
42. **iOS verify callback forged log** → log_sha256 hash mismatch in HMAC → 401
43. **iOS verify callback `-showBuildSettings` fake** → log missing CodeSign/BUILD SUCCEEDED markers → 400
44. **iOS rotation during in-flight verify** — row lock serializes; either verify commits first (rotation invalidates) or rotation commits first (verify sees inactive, 409)
45. **iOS duplicate concurrent callbacks** — atomic consume-if-unconsumed ensures exactly one `accepted` outcome, one verification row, one kit consumption
46. **iOS in-place signing edit** → DB trigger fires, prior verifications invalidated, `ios-signing-verified` requires re-verify
47. **iOS rotation helper** → new row inactive-first, atomic flip, app-level invalidation of prior verifications
48. **iOS verify kit expired** → 410 at callback entry, no state change
49. **iOS verify kit retry after success** → second callback sees `consumed_at`, 409 before transaction
50. **Account deletion applicability** — stateless app (no auth/storage/files/Functions or provably stateless Functions) → `not_applicable`, no block
51. **Account deletion required** — Functions enabled, analyzer inconclusive → `retains_user_data = true`, `account-deletion` check fails until enabled
52. **`needs_action` in DB** — `compliance_checks.status = 'needs_action'` persists, UI renders CTA card
53. **Android Ship to Stores** → Play Console internal track submission end-to-end
54. **iOS Prep Kit download** → bundle downloads, maker runs locally, TestFlight upload via maker's ASC API key
55. **Developer can write `app_signing_configs`** → INSERT + UPDATE succeed via RLS `asc_rw` policy
56. **Viewer cannot touch `app_signing_configs`** → INSERT and UPDATE fail
57. **Pro solo maker can store signing creds** → `store_account_credentials` with `subject_type='user'` works; RLS allows own access
58. **Org admin can store signing creds** → `subject_type='organization'` works for owner/admin/billing_manager

---

## Part 24 — Launch vs Later

| Capability | Launch (Weeks 1–14) | Phase 2 | Phase 3+ |
|---|---|---|---|
| Ship to Web | ✓ | | |
| Ship to Phone (PWA install) | ✓ | | |
| Native Readiness Score | ✓ | | |
| Compliance automation (privacy manifest + Data Safety + SIWA + deletion route) | ✓ | | |
| Functions static analyzer (fail-closed for account-deletion) | ✓ | | |
| Native Bridge SDK (Phase 1 APIs: share, haptics, deviceInfo, deepLink, appReview, notifications, clipboard, appState) | ✓ | Camera, biometric, contacts, filesystem | Full plugin ecosystem |
| Android TWA automated submission | ✓ | | |
| Android Capacitor full build | ✓ | | |
| Android Play Console API (internal track) | ✓ | Production track | |
| iOS Prep Kit (Capacitor + local build + TestFlight via maker's ASC key) | ✓ | | |
| iOS signing verification (bind active config, row-lock, atomic consume) | ✓ | | |
| iOS partner runner (Codemagic / Expo EAS) | | ✓ | |
| iOS direct App Store Connect API + TestFlight | | | ✓ |
| Shippie-managed iOS signing | | | ✓ |
| IAP / Play Billing proxy | | | ✓ |
| White-label submission (Shippie Dev Account) | | | ✓ |
| Internal → Public → Stores path | ✓ | | |
| Stripe billing + invoices | ✓ | | |
| DPA + subprocessor page + security incident policy | ✓ | | |
| Billing manager role | ✓ | | |
| Usage metering + overages | ✓ | | |
| Data residency enforcement | ✓ | | |
| SOC2 Type I | | ✓ | Type II |
| SSO / SAML | | ✓ | |
| SCIM | | | ✓ |
| IP allowlists for private-org apps | | ✓ | |
| Approved app catalog (org-curated) | | ✓ | |
| Moderation queue + auto-classify | ✓ | Human review ops | |
| Apple cert revocation detection (daily cron) | | ✓ | |

---

## Part 25 — Decisions Locked In

1. **Platform hosting**: Next.js 16 on Vercel; Postgres on Hetzner VPS; Cloudflare Tunnel between them
2. **Runtime plane**: Cloudflare Worker wildcard routes for `*.shippie.app` + R2 + Durable Objects for version broadcast
3. **Build runner**: Vercel Sandbox (Firecracker microVMs) for untrusted npm
4. **Functions runtime**: Cloudflare Workers for Platforms (CFW4P) — per-app V8 isolates with per-app env bindings
5. **GitHub integration**: GitHub App (not OAuth App)
6. **Auth**: Auth.js v6 as OAuth 2.0 server with Authorization Code + PKCE; app-origin **opaque-handle** sessions backed by `app_sessions` rows; HMAC-signed Worker↔Platform calls
7. **SDK distribution**: `@shippie/sdk` on npm + `cdn.shippie.app/sdk/v1.latest.js` + same-origin `/__shippie/sdk.js` proxy
8. **Three project types**: `app` / `web_app` / `website` — first-class with distinct install UX, SDK defaults, and ranking
9. **Declarative config**: `shippie.json` (auto-drafted if missing, never blocks deploy by itself)
10. **Deploy default**: Quick Ship — publish on preflight pass; Preview is opt-in
11. **Preflight**: Auto-remediation before block; `__shippie/*` collisions are a hard block (never silently rewritten)
12. **Version pointer**: Postgres is source of truth; KV is read-through cache; DO broadcast invalidates on publish/rollback; instant rollback via pointer swap
13. **`needs_secrets` deploy state**: lives on `deploys.status`, same row reused on retry; `apps.latest_*` derived by trigger
14. **Auto-packaging**: async pipeline for icon / screenshots / copy / changelog / QR / compat report; **web + store sizes in one pass**; never blocks publish
15. **The Three Ships**: Web (all projects) / Phone (app default) / Stores (opt-in, gated by Native Readiness Score ≥85)
16. **Shippie Native Bridge**: first-class SDK layer that beats Apple Rule 4.2
17. **iOS launch = Prep Kit + TestFlight via maker's credentials only**; Production track + Shippie-managed signing disabled in UI, labelled Phase 2/3
18. **Android launch = full automation** via Play Console API + Bubblewrap / Capacitor / Gradle
19. **Store credentials**: split model — reusable `store_account_credentials` (subject-scoped, polymorphic user|org) + per-app `app_signing_configs` (exactly one active per (app, platform))
20. **Signing rotation**: new row inactive-first, atomic flip via single UPDATE (partial unique index evaluated at statement end), app-level invalidation of prior iOS verifications
21. **In-place signing edits**: DB trigger `invalidate_verifications_on_config_change` invalidates verifications when identity fields change
22. **iOS verification**: real signed `xcodebuild clean build` with `-allowProvisioningUpdates`; server-side log marker check; HMAC covers `log_sha256`; callback enforces `body.signing_config_id == kit.signing_config_id`; row lock + atomic consume-if-unconsumed inside transaction; 90-day validity
23. **iOS verification framing**: guided self-attestation with audit trail, not cryptographic proof; bounded by Apple's real review as final backstop
24. **Compliance as code**: `lib/compliance/checks/*` runner with typed `ComplianceResult` (including `needs_action`); `compliance_checks.status` CHECK constraint includes `needs_action`
25. **Account deletion**: conditional — required only when app retains user data (permissions-based + Functions static analyzer fail-closed)
26. **Functions static analyzer**: fail-closed for `retains_user_data`; inconclusive verdict cannot be overridden; annotations log but don't silence
27. **Feedback**: unified `feedback_items` typed system
28. **Ranking**: hourly cron, weighted per type, burst-flagged, maker actions discounted
29. **Business operations at launch**: Stripe billing + invoices + DPA + subprocessor page + security incident policy + billing_manager role + usage metering + overages + data residency
30. **Moderation**: auto-classifier + sock-puppet detection + vote ring detection + rate limits + comment auto-mod
31. **Trust surfaces**: `/trust/subprocessors`, `/trust/security`, `/trust/dpa`, `/trust/compliance` — public from launch
32. **Email**: Resend
33. **Search**: Postgres FTS + pg_trgm from launch; Meilisearch only if relevance is insufficient

---

## Part 26 — Open Questions (All Phase 2 / Operational Tuning)

1. **UI cooldown** on "Download verify kit" immediately after rotation (Phase 1 soft fix)
2. **Offline signing fallback** for corporate networks that block Apple Developer API (Phase 2 only if a real customer hits it)
3. **Apple cert revocation detection** via ASC API polling (Phase 2 daily cron)
4. **SOC2 threat model document** for business customers (Phase 2 alongside SOC2 Type I prep)
5. **Rejected-kit retention** — 180 days then archive; never hard-delete
6. **High-rotation-rate alerting** — monitor; escalate if >10 rotations/minute on a single app
7. **`ios_verify_kits` lifetime** — 14 days at launch, tune after real usage
8. **Xcode signing markers per major version** — compatibility table for older toolchains
9. **Functions static analyzer false positives** — `// @shippie-stateless: reason` annotations logged but never silence
10. **Credential transfer across plan transitions** — one-click "transfer to org" for solo Pro → Team (Phase 2)
11. **Automatic-signing verification on non-Mac dev machines** — verify kit is portable by design
12. **Log storage retention** — verify kit logs kept 1 year then deleted; maker can export

---

## Closing

**v6 is implementation-ready.** The maker promise and the launch implementation say the same thing across:
- Pricing (solo Pro and org Ship to Stores both work)
- Auth (same-origin everywhere, opaque handles, no client trust)
- Runtime (`__shippie/*` reserved, hard-blocked collisions)
- Deploy history (per-version `needs_secrets` with same-row retry)
- Build correctness (no silent rewriting, multi-package-manager, framework presets)
- iOS honesty (TestFlight via Prep Kit only at launch; real signed build verification with row-lock and atomic consume)
- Compliance (static-only applicability, Functions fail-closed, `needs_action` persistable)
- Trust (enforced outbound allowlist, signed Worker↔Platform, RLS with WITH CHECK on all writes)
- Business (Stripe, DPA, subprocessor, security incident policy, billing_manager role from day 1)

**Next steps when ready to build:**
1. Initialize the monorepo scaffold (Next.js 16 + Drizzle + Auth.js v6 + Turborepo, Bun workspaces)
2. Stand up Hetzner Postgres + PgBouncer + Cloudflare Tunnel to Vercel
3. Write migrations `0001` through `0007` in order
4. Set up CI with the migration test matrix for all triggers and RLS policies
5. Begin Week 1 of the build plan

The spec is ready. 14 weeks to launch.
