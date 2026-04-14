# Shippie — Implementation Plan (v3)

## Context

Shippie is "apps on your phone, without the App Store." Three products in one: a deploy platform, a discovery marketplace, and a feedback engine. The core promise is that a maker can ship a repo or zip and instantly get a real phone-installable product without writing backend code.

**This plan is a full rewrite around a single invariant.**

---

## The Invariant

> **Every project deployed on Shippie becomes a Shippie-managed runtime on its own origin, with reserved same-origin system routes for auth, storage, feedback, analytics, install UX, and app metadata.**

Every app hosted at `{slug}.shippie.app` has guaranteed system endpoints under `__shippie/*`. The Cloudflare Worker is not a static file server — it is the **app runtime**. It intercepts `__shippie/*` requests and serves them from system logic; everything else flows to the maker's files in R2.

This changes everything:
- **SDK calls are same-origin**, never cross-origin. No CORS, no third-party cookies, no token juggling in JS.
- **Sessions are httpOnly cookies on the app's own origin**, set by the Worker. XSS in the maker's code cannot read them.
- **Auth is an OAuth flow that establishes an app-origin session**, not a JWT passed around in headers.
- **The Worker is the trust boundary**. It holds the session decryption key and proxies authorized requests to the platform API.
- **`shippie.app` is the control plane**; `*.shippie.app` is the runtime plane. Clean separation.

Everything else in this plan flows from this one decision.

---

## Two Planes

### Control Plane — `shippie.app` (Next.js on Vercel)
- Marketing site, storefront, discovery, search, leaderboards
- Maker sign-in, dashboard, deploy UI
- OAuth authorization server (`/oauth/authorize`, `/oauth/token`)
- Admin / moderation
- Platform API (`/api/internal/*`) — only reachable via signed requests from the Worker
- GitHub App webhook receivers
- Build orchestration (Vercel Sandbox)

### Runtime Plane — `*.shippie.app` (Cloudflare Worker + R2)
- Serves maker files from R2 (via version pointer)
- Owns `__shippie/*` system routes (session, storage, feedback, analytics, install, manifest, sw, sdk)
- Sets and reads app-origin httpOnly session cookies
- Proxies storage/feedback/analytics calls to platform API with signed session tokens
- Runtime PWA injection via HTMLRewriter as fallback
- Version pointer swap = atomic deploy / rollback

---

## Three Project Types (First-Class)

Same infra, same deploy engine, different runtime behavior and discovery shelves.

| Type | Runtime | Install UX | Leaderboard | Example |
|------|---------|-----------|-------------|---------|
| `app` | Full Shippie runtime: PWA, SDK, storage, auth, notifications, install banners | Aggressive "Add to Phone" CTA, QR on desktop, iOS A2HS guide, Android install prompt | Installs + retention + engagement weighted | Recipe saver, habit tracker |
| `web_app` | Full runtime, but browser-first UI. SDK + feedback enabled. No aggressive install banner. | Optional install banner; desktop-optimised | Engagement + return visits weighted | SaaS dashboard, calculator, design tool |
| `website` | Static + light runtime. Feedback + analytics available; SDK storage/auth optional. | None by default | Views + upvotes weighted; decay-heavy | Docs site, landing page, portfolio |

Type is declared in `shippie.json` or chosen in the New Project form. Discovery surfaces have separate shelves per type so "a portfolio" doesn't swamp "an installable app."

---

## Reserved Route Contract (`__shippie/*`)

Every app's Worker owns these paths. Maker files that collide are **rejected at deploy** (preflight check) and **intercepted at request time** (Worker routes system paths first, always).

```
__shippie/sdk.js              GET  — hosted Shippie SDK, same-origin
__shippie/manifest            GET  — generated PWA manifest.json
__shippie/sw.js               GET  — generated service worker
__shippie/icons/{size}.png    GET  — generated app icons from uploaded source

__shippie/auth/login          GET  — initiate OAuth; redirects to shippie.app/oauth/authorize
__shippie/auth/callback       GET  — exchange code, set session cookie, redirect to return_to
__shippie/auth/logout         POST — clear session cookie
__shippie/auth/revoke         POST — revoke session across all devices

__shippie/session             GET  — returns { user, scope, expires_at } or 401
                              DELETE — alias for logout

__shippie/storage/:collection         GET    — list items
__shippie/storage/:collection/:key    GET    — get item
__shippie/storage/:collection/:key    PUT    — set item (body = data)
__shippie/storage/:collection/:key    DELETE — delete item
__shippie/storage/public/:collection  GET    — list public items
__shippie/storage/public/:collection/:key  (auth required for write)

__shippie/files               POST — request presigned R2 upload URL
__shippie/files/:key          GET  — fetch file
                              DELETE — delete file

__shippie/feedback            POST — submit feedback item (typed: comment, bug, request, rating)
__shippie/feedback            GET  — list feedback for this app (public)
__shippie/feedback/:id/vote   POST — upvote a feedback item

__shippie/analytics           POST — track event (batched)

__shippie/install             POST — register install (device-aware)
__shippie/install             GET  — check install state for current device

__shippie/health              GET  — runtime health (version, build info, status)
__shippie/health/ping         GET  — simple liveness

__shippie/meta                GET  — app public metadata (name, icon, type, maker, permissions, version)
```

**Preflight rejects builds that**:
- produce any file under `__shippie/` in output
- produce a top-level `manifest.json` or `sw.js` without declaring `conflict_policy` in `shippie.json`
- produce files that would shadow `__shippie/*`

**Conflict policy** (declared in `shippie.json`):
- `shippie` (default) — platform manifest/SW wins, maker's is ignored
- `merge` — platform manifest merges with maker's keys; SW chains platform SW first
- `own` — maker keeps theirs entirely; SDK features disabled for SW-dependent ones (warning shown)

---

## `shippie.json` Spec

Declarative build + runtime config. Placed at repo root or inferred from framework detection.

```jsonc
{
  "$schema": "https://shippie.app/schema/shippie.json",
  "version": 1,
  "slug": "recipes",                    // optional; platform assigns if omitted
  "type": "app",                         // "app" | "web_app" | "website"
  "name": "Recipes",
  "tagline": "Save, organize, search your recipes",
  "description": "A simple recipe manager for your phone.",
  "category": "lifestyle",
  "icon": "./public/icon.png",
  "theme_color": "#f97316",
  "background_color": "#ffffff",

  "framework": "next",                   // auto-detected if omitted
  "build": {
    "command": "npm run build",
    "output": "out",                     // relative to root
    "node": "20",
    "root_directory": ".",               // for monorepos
    "env_build": ["PUBLIC_*"],           // build-time env var allowlist
    "install_command": "npm ci --ignore-scripts"
  },

  "pwa": {
    "display": "standalone",
    "orientation": "portrait",
    "start_url": "/",
    "scope": "/",
    "conflict_policy": "shippie",        // shippie | merge | own
    "screenshots": ["./public/screen-1.png", "./public/screen-2.png"]
  },

  "sdk": {
    "version": "1.x",                    // 1.x = auto-update patch/minor, 1.2.3 = pinned
    "auto_inject": true
  },

  "permissions": {
    "auth": true,
    "storage": "rw",                     // false | "r" | "rw"
    "files": true,
    "notifications": false,
    "analytics": true,
    "external_network": false            // true if app calls outside shippie.app
  },

  "allowed_connect_domains": [           // CSP connect-src allowlist (besides __shippie/*)
    "api.example.com"
  ],

  "listing": {
    "visibility": "public",              // public | unlisted | private
    "featured_candidate": true,
    "require_consent_screen": true
  },

  "feedback": {
    "enabled": true,
    "types": ["comment", "bug", "request", "rating"]
  },

  "env_schema": {                        // runtime env vars the app declares it needs
    "API_KEY": { "required": false, "secret": true, "scope": "server" }
  }
}
```

**Draft config generation**: if no `shippie.json`, deploy pipeline inspects the repo:
- `package.json` → detects framework (next, vite, remix, astro, sveltekit, nuxt, vue, react, plain static)
- `README.md` → extracts name/description fallback
- public icon candidates (`icon.png`, `favicon.png`, `public/icon*`)
- Generates draft + shows diff in UI before first deploy

---

## Authentication Model (New — Worker-Managed App-Origin Sessions)

This is the single biggest fix versus v2. Instead of OAuth → JWT → cross-origin API calls, the Worker establishes a real session on the app's own origin.

### Primitives
- **Platform session** — httpOnly cookie on `shippie.app` only. Identifies a human user to the control plane.
- **App session** — httpOnly cookie on `{slug}.shippie.app`, set by the Worker after OAuth. Identifies a user to this specific app. **Encrypted and signed.**
- **Device session ID** — opaque UUID inside the app session, tracked server-side in `app_sessions` table so users can see and revoke per-device.

### Session Cookie Contents
Encrypted with AES-GCM using a platform-wide key. Worker and platform API share the decryption key.
```
{
  v: 1,
  uid: "user-uuid",
  aid: "app-uuid",
  sid: "session-uuid",     // device session, looked up in app_sessions
  scope: ["auth", "storage", "files", "analytics"],
  exp: 1712864400,
  iat: 1712860800
}
```
- Cookie name: `__shippie_session`
- `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no Domain (origin-scoped)
- 30 day expiry with rolling renewal
- Key rotation: dual-key with `kid` header, rotate monthly

### Full OAuth Flow

```
1. App code calls shippie.auth.signIn(return_to?)
   ↓
2. SDK navigates browser to: /__shippie/auth/login?return_to=/after-login
   ↓
3. Worker at recipes.shippie.app generates a state+PKCE pair, stores in short-lived KV
   ↓
4. Worker redirects to:
   https://shippie.app/oauth/authorize
     ?client_id=app_recipes_xyz
     &redirect_uri=https://recipes.shippie.app/__shippie/auth/callback
     &code_challenge={PKCE challenge}
     &state={opaque}
     &scope=auth storage files analytics
   ↓
5. Platform checks shippie.app session cookie
   ↓
6a. If signed in and consent recorded → auto-redirect to callback with code
6b. If signed in but no consent → show "Allow Recipes to access your Shippie account" screen
6c. If not signed in → sign-in page, then consent, then callback
   ↓
7. Browser redirects to https://recipes.shippie.app/__shippie/auth/callback?code=...&state=...
   ↓
8. Worker:
    - validates state
    - POSTs to https://shippie.app/oauth/token (server-to-server, signed)
      with { code, code_verifier, client_id }
    - receives { user_id, scope, device_session_id }
    - encrypts + signs an app session token
    - sets __shippie_session cookie on recipes.shippie.app
    - redirects to return_to or "/"
   ↓
9. App now makes same-origin __shippie/storage/* calls
   ↓
10. Worker reads session cookie, verifies signature, forwards request to
    platform API with a signed header containing the session claims
    ↓
11. Platform API verifies Worker signature, sets Postgres RLS session vars
    (app.current_app_id, app.current_user_id), runs the query
```

### What's Better Than v2
- **No tokens in localStorage.** Nothing for XSS to steal in the app.
- **Same-origin everything**. No CORS. No third-party cookie quirks. Works on Safari, iOS, everywhere.
- **Revocation is cookie invalidation + session row deletion.** Instant.
- **Per-device sessions** tracked in Postgres, visible in user dashboard, revokable individually.
- **Scope changes** require re-consent but not a new full auth — just re-issue the cookie.
- **Worker is the trust boundary.** Platform API only trusts signed requests from the Worker.

### Worker ↔ Platform Signing
- Worker holds a shared secret (`WORKER_PLATFORM_SECRET`) in CF secrets.
- Every proxied request includes `X-Shippie-Signature: HMAC-SHA256(secret, method + path + body + timestamp)` and `X-Shippie-Timestamp`.
- Platform API rejects requests older than 30s.
- Secret rotates via dual-key.

### Cross-Device Sign-In
User signs in on desktop, scans QR to open app on phone. Because auth is app-origin, each device gets its own session. No handoff needed; user just signs in again on phone (fast, because they're already signed into shippie.app in their phone browser). QR surfaces are default on every detail page and install screen.

---

## Shippie SDK Design (Updated — Same-Origin)

### Surface Area
```typescript
// All calls are same-origin. No tokens passed around.

shippie.auth.getUser(): Promise<User | null>         // GET /__shippie/session
shippie.auth.signIn(returnTo?): Promise<User>        // navigates to /__shippie/auth/login
shippie.auth.signOut(): Promise<void>                // POST /__shippie/auth/logout
shippie.auth.onChange(callback): Unsubscribe         // polling or BroadcastChannel (same-origin)

shippie.db.set(collection, key, data, opts?): Promise<void>
shippie.db.get(collection, key): Promise<T | null>
shippie.db.list(collection, opts?): Promise<T[]>
shippie.db.delete(collection, key): Promise<void>
// opts: { public?: boolean, ttl?: number }

shippie.files.upload(blob, filename): Promise<{ url, key }>
shippie.files.get(key): Promise<Blob>
shippie.files.delete(key): Promise<void>

shippie.notify.send(title, body, opts?)              // Phase 2
shippie.notify.subscribe()                           // Phase 2

shippie.track(event, props?)                         // fire-and-forget

shippie.feedback.open(type?)                         // opens native feedback UI modal
shippie.feedback.submit(item)                        // programmatic submission

shippie.install.prompt()                             // triggers install UX
shippie.install.status(): 'installed' | 'installable' | 'unsupported'

shippie.meta(): Promise<AppMeta>                     // GET /__shippie/meta
```

### Distribution
- **npm**: `@shippie/sdk` (ESM + CJS + IIFE; TypeScript types bundled)
- **Hosted**: `cdn.shippie.app/sdk/v1.latest.js` and `cdn.shippie.app/sdk/v1.2.3.js` (pinned)
- **Same-origin**: `__shippie/sdk.js` injected automatically by Worker; the Worker proxies this to the hosted CDN so apps get cache locality on their own origin

### Auto-Injection Script Tag
Deploy pipeline injects into `<head>`:
```html
<script src="/__shippie/sdk.js" async></script>
```
Same-origin, can use modern browser features, no cross-origin preload issues.

---

## PWA Injection Pipeline

### Build-Time (Primary)
On every deploy, after extracting build output:
1. Walk all `.html` files with `htmlparser2`
2. Inject into `<head>`:
   - `<link rel="manifest" href="/__shippie/manifest">`
   - `<meta name="theme-color" content="{theme_color}">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
   - `<link rel="apple-touch-icon" href="/__shippie/icons/180.png">`
   - `<link rel="icon" type="image/png" sizes="192x192" href="/__shippie/icons/192.png">`
   - `<meta http-equiv="Content-Security-Policy" content="...">` (per app from `shippie.json`)
   - `<script src="/__shippie/sdk.js" async></script>`
3. Inject before `</body>`: service worker registration script that registers `/__shippie/sw.js`
4. Process icons: resize uploaded icon to 48, 72, 96, 144, 152, 180, 192, 256, 384, 512
5. Generate splash screens for common iOS device sizes
6. Upload resized assets to `r2://shippie-apps/{slug}/v{version}/__shippie-assets/`
7. Build deploy artifact manifest (file list + sizes + hashes) and store in KV

### Runtime (Worker)
- `/__shippie/manifest` → generated JSON from app record + latest version (cached 1h)
- `/__shippie/sw.js` → generated from template + app version + cache names
- `/__shippie/icons/{size}.png` → serve from R2
- `/__shippie/sdk.js` → serve SDK bundle (cached 24h, versioned)
- Missing PWA tags in HTML (if maker removed them) → HTMLRewriter injects at response time

### Service Worker Strategy
- **HTML documents**: network-first (always try fresh, fallback cache). Ensures users get latest version.
- **Hashed assets** (`/_next/static/*.js`, `/assets/*.{hash}.*`): cache-first, immutable, 1-year max-age.
- **Unhashed assets**: stale-while-revalidate.
- **API calls to `__shippie/*`**: never cache.
- **Version naming**: caches named `{slug}-v{version}`; old caches removed on `activate` event.
- **Update flow**: on page load, SDK checks `__shippie/health` for current version; if mismatch, triggers `registration.update()` and shows "refresh for latest" banner (non-blocking).

---

## Deploy Pipeline

### States
```
draft → building → ready → live
                      ↓
                   failed
                      ↓
                  rolled_back
                      ↓
                   takedown
```
Additional: `preview` state for builds that are ready but not yet published to the public listing.

### Atomic Version Switching
Every deploy produces a new version. Versions are immutable in R2. The active version is a pointer in Cloudflare KV:

```
apps:{slug}:active → "v42"
apps:{slug}:preview → "v43"   // staging before publish
apps:{slug}:meta → { type, permissions, theme, icon, conflict_policy, ... }
```

**Rollback** = update `apps:{slug}:active` to a previous version. Zero downtime, zero file movement.

**Preview URL** (Pro) = `{slug}-preview.shippie.app` serves from `preview` pointer.

**Retention**: keep last 10 versions + all versions from the last 30 days. Purge older via cron.

### Preflight (before build)
Validation pass that runs after source is available but before build:
- Slug validation: format, not reserved, not already taken, not on profanity list, not impersonating another maker
- `shippie.json` parse + schema validation (or draft generation)
- Reserved path collision scan (`__shippie/*` in committed files)
- Manifest/SW conflict check vs declared `conflict_policy`
- Unsupported pattern scan: server-only code in "static" types (Next.js API routes, fs writes at runtime)
- Missing required fields: name, icon, category
- Icon presence + size check (min 512x512)
- Env var requirements declared vs available
- Build command safety: no `rm -rf`, no network-access pattern outside install phase
- Package age risk: block deploys where `package-lock.json` includes packages < 72h old (configurable)
- Native module advisory: flag node-gyp usage (may slow builds)
- Secret leakage scan: grep for common secret patterns in source tree
- Report results to maker UI; block or warn as appropriate

### Deploy Flow
```
Source ready (GitHub clone or zip extracted to staging in R2)
  ↓
Preflight runs → results shown to maker
  ↓
If source is pre-built static (uploaded dist/ or type=website):
  skip to Validate Output
Else:
  Vercel Sandbox is provisioned
  Sandbox clones source into /workspace
  Runs: (install_command) && (build_command)
  Streams logs via SSE → dashboard
  Exports build output via HTTP port
  Sandbox terminates
  ↓
Validate Output:
  - must contain index.html (unless type=website with custom config)
  - total size under 200MB (configurable by tier)
  - no files under __shippie/
  - asset path sanity (no absolute URLs pointing at platform secrets)
  ↓
PWA Injection pass (build-time)
  ↓
Upload all files to R2: shippie-apps/{slug}/v{version}/*
  ↓
Build version manifest (file list, hashes, total size)
  ↓
Write KV: apps:{slug}:v{version}:meta
  ↓
(Preview) Write KV: apps:{slug}:preview → "v{version}"
  ↓
Warm cache: fire requests to critical paths (index.html, sdk, manifest)
  ↓
(Publish) Write KV: apps:{slug}:active → "v{version}"
  ↓
Listing detail page reflects new version
  ↓
Done. Live at {slug}.shippie.app
```

Webhook-driven deploys go to `preview` by default; maker chooses "publish" to flip `active`. Optional auto-publish on main branch (opt-in per app).

### Build Runner: Vercel Sandbox
- `npm ci --ignore-scripts` (postinstall blocked)
- Network allowlisted to npm registry only during install; full network OK during build (needed for Next.js, etc.)
- Memory 4GB, CPU 4 vCPU, timeout 10 min
- Package age gate via `min-release-age=3` (72h quarantine)
- Full logs captured in `deploys.build_log`
- Sandbox terminates on completion — no persistent state

### Build Cache
- Cache `node_modules` keyed by hash of `package-lock.json` + Node version + OS
- Stored in R2 as tar.zst
- Loaded into sandbox before install; skipped if hash miss

---

## Trust Metadata (On Every Listing)

Visible on every app detail page. Users see exactly what they're trusting.

```
Maker: @username (verified?)
Source: GitHub → octocat/recipes (verified install?)
        ─ or ─
        Uploaded zip
Last deployed: 3 hours ago
Active version: v42
Permissions requested:
  ✓ Sign in with Shippie
  ✓ Per-user storage (read/write)
  ✗ File uploads
  ✗ Notifications
  ✓ Analytics (anonymous)
External domains:
  api.example.com (read-only)
CSP: restrictive (no external scripts)
Deploy health: 98% successful, 0 rollbacks
Takedown reports: 0
```

Verification tiers:
- **Unverified maker** — default; username is self-claimed
- **Verified maker** — domain or social verification (GitHub, Twitter, website)
- **Verified source** — GitHub repo verified via GitHub App installation, maker matches repo owner
- **Trusted maker** — 5+ apps, 30 day maker history, no takedowns (automated tier upgrade)

---

## Data Model (Expanded)

Key additions vs v2: `app_sessions`, `oauth_consents`, `device_installs`, `deploy_artifacts`, `app_permissions`, `feedback_items`, `feedback_votes`, `reports`, `moderation_actions`, `leaderboard_snapshots`. Partial unique indexes for public data. RLS `WITH CHECK` on all writes.

### Identity
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
  verification_source text,               -- 'github' | 'domain' | 'twitter'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auth.js tables via @auth/drizzle-adapter
```

### Apps
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
  source_type text not null,              -- 'github' | 'zip'
  conflict_policy text default 'shippie',
  deploy_status text default 'draft',     -- draft | building | ready | live | failed | rolled_back | takedown
  active_version int,
  preview_version int,
  visibility text default 'public',       -- public | unlisted | private
  is_archived boolean default false,
  takedown_reason text,
  maker_id uuid not null references users(id),
  upvote_count int default 0,
  install_count int default 0,
  active_users_30d int default 0,
  feedback_open_count int default 0,
  ranking_score_app double precision default 0,
  ranking_score_web_app double precision default 0,
  ranking_score_website double precision default 0,
  last_deployed_at timestamptz,
  first_published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table apps add column fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) stored;
create index apps_fts_idx on apps using gin(fts);
create index apps_trgm_idx on apps using gin(name gin_trgm_ops);
```

### Permissions
```sql
create table app_permissions (
  app_id uuid primary key references apps(id) on delete cascade,
  auth boolean default false,
  storage text default 'none',            -- 'none' | 'r' | 'rw'
  files boolean default false,
  notifications boolean default false,
  analytics boolean default true,
  external_network boolean default false,
  allowed_connect_domains text[] default array[]::text[],
  updated_at timestamptz default now()
);
```

### Deploys + Artifacts
```sql
create table deploys (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  version int not null,
  commit_sha text,
  source_type text not null,
  shippie_json jsonb,                     -- snapshot of config at deploy time
  changelog text,
  status text default 'building',
  build_log text,
  preflight_report jsonb,
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
  r2_prefix text not null,                -- e.g., "recipes/v42"
  file_count int not null,
  total_bytes bigint not null,
  manifest jsonb not null,                -- { files: [{path, sha256, size}] }
  created_at timestamptz default now()
);
```

### OAuth + Sessions
```sql
create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  client_id text unique not null,
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
  expires_at timestamptz not null,        -- 60 seconds
  used boolean default false
);

create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  scope text[] not null,
  user_agent text,
  ip_hash text,
  device_fingerprint text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index app_sessions_user_app_idx on app_sessions (user_id, app_id) where revoked_at is null;
```

### SDK Storage [RLS]
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

-- partial unique indexes split private vs public
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
```

### Files [RLS]
```sql
create table app_files (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  r2_key text unique not null,            -- files/{app_id}/{user_id}/{uuid}
  size_bytes int not null,
  mime_type text not null,
  created_at timestamptz default now()
);
-- Same RLS pattern as app_data, with check
```

### Device Installs
```sql
create table device_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  device_fingerprint text,                -- hashed UA + platform + screen
  platform text,                          -- 'ios' | 'android' | 'desktop'
  install_prompt_shown_at timestamptz,
  a2hs_confirmed_at timestamptz,          -- user tapped "Add to Home Screen"
  display_mode_standalone_seen_at timestamptz,  -- first launch in standalone mode
  launched_from_home_screen_count int default 0,
  last_launched_at timestamptz,
  uninstalled_at timestamptz,
  created_at timestamptz default now()
);
```

### Unified Feedback
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
  screenshot_key text,                    -- R2 key if user uploaded screenshot
  repro_steps text,
  status text default 'open',             -- open | acknowledged | planned | shipped | declined | duplicate | spam
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

### Social
```sql
create table upvotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  app_id uuid not null references apps(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, app_id)
);
```

### Moderation
```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  feedback_id uuid references feedback_items(id) on delete cascade,
  reporter_id uuid references users(id),
  reason text not null,
  details text,
  status text default 'open',             -- open | reviewing | resolved | dismissed
  created_at timestamptz default now()
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,                    -- takedown | warning | restore | shadowban | ban
  reason text,
  moderator_id uuid references users(id),
  created_at timestamptz default now()
);
```

### Leaderboards
```sql
create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  shelf text not null,                     -- new_and_hot | most_installed | most_loved | rising | best_updated_week | trending
  type text not null,                      -- app | web_app | website
  period_start timestamptz not null,
  period_end timestamptz not null,
  rankings jsonb not null,                 -- [{ app_id, score, rank, factors: {...} }]
  created_at timestamptz default now()
);
create index leaderboard_shelf_type_period_idx on leaderboard_snapshots (shelf, type, period_end desc);
```

Ranking is computed hourly via a cron job. Weighted inputs:
- `app`: 40% installs × 7d retention, 25% recent engagement (sessions in 7d), 15% feedback resolution rate, 10% launch velocity (deploys / feedback), 10% recency decay
- `web_app`: 35% return visits, 25% sessions, 20% upvotes (decayed), 10% feedback resolution, 10% recency
- `website`: 40% views (decayed), 30% upvotes, 20% recency, 10% feedback engagement

Maker/team actions discounted. Suspicious bursts flagged and excluded from ranking (rate-limit per IP/user).

### Analytics (partitioned)
```sql
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id),
  session_id text,
  event_name text not null,
  event_data jsonb,
  created_at timestamptz default now()
) partition by range (created_at);

-- monthly partitions, 90d retention, hourly rollup to analytics_daily
```

### Quotas
```sql
create table app_quotas (
  app_id uuid primary key references apps(id) on delete cascade,
  tier text default 'free',                -- free | pro | team
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

### Reserved Slugs
```sql
create table reserved_slugs (
  slug text primary key,
  reason text not null,                    -- 'system' | 'brand' | 'admin-reserved'
  created_at timestamptz default now()
);
-- seeded with: shippie, www, api, cdn, admin, mail, app, docs, help,
-- status, blog, about, ...and known brand trademarks
```

---

## Project Structure

```
shippie/
├── apps/
│   └── web/                              # Next.js 16 on Vercel — control plane
│       ├── app/
│       │   ├── (marketing)/
│       │   ├── (storefront)/             # Browse, search, leaderboards per type
│       │   │   └── apps/[slug]/          # Detail page, install UX, feedback UI
│       │   ├── (dashboard)/              # Maker dashboard: apps, feedback inbox, deploys, settings
│       │   ├── (auth)/
│       │   ├── oauth/                    # UI: /authorize, /consent
│       │   └── api/
│       │       ├── auth/                 # Auth.js
│       │       ├── oauth/
│       │       │   ├── token/            # POST /oauth/token (code exchange)
│       │       │   └── consents/         # consent revocation
│       │       ├── internal/             # Worker ↔ Platform endpoints (signed)
│       │       │   ├── sdk/
│       │       │   │   ├── storage/      # DB ops from Worker
│       │       │   │   ├── files/
│       │       │   │   ├── analytics/
│       │       │   │   └── feedback/
│       │       │   ├── session/          # session validation helpers
│       │       │   └── install/
│       │       ├── webhooks/github/
│       │       ├── deploy/               # Trigger Sandbox build
│       │       ├── admin/
│       │       └── cron/                 # Ranking jobs, quota resets, analytics rollups
│       ├── middleware.ts                 # Signed-request verification + rate limit
│       ├── lib/
│       │   ├── db/                       # Drizzle client + PgBouncer pool
│       │   ├── auth/                     # Auth.js config
│       │   ├── oauth/                    # Consent, code + token issuance
│       │   ├── session-crypto/           # AES-GCM + HMAC for Worker cookies
│       │   ├── sandbox/                  # Vercel Sandbox client
│       │   ├── r2/                       # R2 client + version pointer helpers
│       │   ├── preflight/                # Deploy preflight checks
│       │   ├── pwa-injector/             # htmlparser2 + icon resizing
│       │   ├── github/                   # GitHub App client
│       │   └── ranking/                  # Leaderboard score calculation
│       ├── components/
│       └── vercel.ts
│
├── packages/
│   ├── sdk/                              # @shippie/sdk (same-origin client)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── auth.ts                   # calls /__shippie/auth/*
│   │   │   ├── db.ts                     # calls /__shippie/storage/*
│   │   │   ├── files.ts                  # calls /__shippie/files/*
│   │   │   ├── feedback.ts               # calls /__shippie/feedback/*
│   │   │   ├── analytics.ts              # calls /__shippie/analytics
│   │   │   ├── install.ts                # beforeinstallprompt + iOS a2hs
│   │   │   ├── notify.ts                 # Phase 2
│   │   │   └── http.ts                   # same-origin fetch wrapper
│   │   └── package.json
│   │
│   ├── db/                               # Drizzle schema + migrations
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── session-crypto/                   # Shared between web and worker
│   │   └── src/                          # AES-GCM encrypt/decrypt session tokens
│   │
│   └── shared/                           # Types, constants, shippie.json schema
│
├── services/
│   └── worker/                           # Cloudflare Worker — runtime plane
│       ├── src/
│       │   ├── index.ts                  # Main fetch handler + routing
│       │   ├── router/
│       │   │   ├── files.ts              # Serve R2 files with cache
│       │   │   ├── system.ts             # __shippie/* dispatcher
│       │   │   ├── sdk.ts                # /__shippie/sdk.js
│       │   │   ├── manifest.ts           # /__shippie/manifest
│       │   │   ├── sw.ts                 # /__shippie/sw.js (generated)
│       │   │   ├── icons.ts              # /__shippie/icons/*
│       │   │   ├── auth.ts               # /__shippie/auth/*
│       │   │   ├── session.ts            # /__shippie/session
│       │   │   ├── storage.ts            # /__shippie/storage/*
│       │   │   ├── files-proxy.ts        # /__shippie/files/*
│       │   │   ├── analytics.ts          # /__shippie/analytics
│       │   │   ├── feedback.ts           # /__shippie/feedback
│       │   │   ├── install.ts            # /__shippie/install
│       │   │   ├── health.ts             # /__shippie/health
│       │   │   └── meta.ts               # /__shippie/meta
│       │   ├── kv/
│       │   │   ├── app-config.ts         # Read apps:{slug}:meta, :active, :preview
│       │   │   └── session.ts            # Short-lived KV for OAuth state/PKCE
│       │   ├── session/
│       │   │   ├── cookie.ts             # Set/read __shippie_session
│       │   │   └── crypto.ts             # AES-GCM + HMAC (shared with platform)
│       │   ├── platform-client.ts        # Signed requests to shippie.app/api/internal/*
│       │   └── html-rewriter.ts          # Runtime PWA injection fallback
│       ├── wrangler.toml                 # Routes: *.shippie.app/*, cdn.shippie.app/*
│       └── package.json
│
├── infra/
│   ├── hetzner/
│   │   ├── setup.sh                      # Postgres + PgBouncer install
│   │   ├── postgres.conf
│   │   └── pgbouncer.ini
│   ├── cloudflare/
│   │   ├── dns-notes.md                  # wildcard DNS setup
│   │   └── tunnel-setup.md               # Cloudflare Tunnel Vercel→Hetzner
│   └── github-app/
│       └── manifest.json                 # GitHub App permissions
│
├── docs/
│   ├── shippie-json-spec.md
│   ├── sdk-reference.md
│   ├── permission-model.md
│   └── conflict-policies.md
│
├── turbo.json
├── package.json
└── README.md
```

---

## 10-Week Build Plan

Expanded from 8 to 10 weeks because of the runtime-plane scope.

### Week 1 — Foundation
- Monorepo: Next.js 16 + Drizzle + Auth.js v6 + Turborepo
- Vercel project, preview URL setup
- Hetzner VPS: Postgres 16 + PgBouncer + Cloudflare Tunnel to Vercel
- Write initial migrations (users, apps, deploys, app_permissions, oauth_*, app_sessions, app_data with RLS WITH CHECK)
- Auth.js with GitHub + Google + Apple providers, sign in/out
- Platform layout shell + marketing landing
- `packages/session-crypto` with AES-GCM + HMAC (shared between web and worker)
- DNS setup: `shippie.app`, `*.shippie.app`, `cdn.shippie.app`, Advanced Certificate Manager
- Seed `reserved_slugs` with system + brand names

### Week 2 — Worker Runtime + Static Hosting
- Cloudflare Worker scaffold with `*.shippie.app/*` wildcard route
- KV namespaces: app-config, version pointers, session state
- Serve files from R2 with Cache API (HTML network-first, assets immutable)
- `__shippie/sdk.js` served from worker (static asset)
- `__shippie/health`, `__shippie/meta` — read from KV
- `__shippie/manifest` generated from app config
- `__shippie/sw.js` generated from template
- `__shippie/icons/*` served from R2
- HTMLRewriter-based runtime PWA injection (fallback)
- Atomic version pointer swap + rollback endpoint

### Week 3 — Deploy Pipeline (Static First)
- New Project form: slug, type, category, icon upload, visibility
- Zip upload flow → R2 staging → preflight → validate → publish
- Preflight checks: slug rules, reserved paths, manifest conflicts, size limits
- Build-time PWA injection (htmlparser2 + icon resize pipeline)
- Draft `shippie.json` generation from uploaded sources
- KV writes for app config, active version
- Ship 5–10 static tools you build yourself
- Deploy status page with live progress
- Preview vs publish distinction

### Week 4 — OAuth Server + Worker Auth Flow
- Platform: `/oauth/authorize` (sign-in + consent screens), `/oauth/token` (code exchange)
- `oauth_clients` + `oauth_consents` + `oauth_authorization_codes` + `app_sessions` working
- Worker: `/__shippie/auth/login` → redirect to platform
- Worker: `/__shippie/auth/callback` → exchange code, set encrypted cookie
- Worker: `/__shippie/session` → read cookie, verify, return user
- Worker: `/__shippie/auth/logout` → clear cookie, revoke session row
- Device session tracking (user agent, IP hash, device fingerprint)
- User dashboard: "Apps with access" list + per-device revocation
- Test cross-device sign-in with QR code handoff

### Week 5 — SDK Core + Storage
- `@shippie/sdk` package scaffold; same-origin fetch wrapper
- `shippie.auth.getUser/signIn/signOut/onChange` implemented via `__shippie/auth/*`
- `shippie.db.set/get/list/delete` (private + public) via `__shippie/storage/*`
- Platform API internal endpoints: signed request verification, session decryption, RLS session vars
- Quota enforcement with 429 + clear errors
- Build 3–4 stateful apps using the SDK: recipe app, habit tracker, workout logger, mood journal
- Publish `@shippie/sdk` to npm v1.0.0
- Host SDK bundle at `cdn.shippie.app/sdk/v1.latest.js` + pinned versions

### Week 6 — GitHub App + Vercel Sandbox Builds
- GitHub App registration (webhooks, install flow, permissions)
- Repo connection UI in maker dashboard
- Webhook handlers for push, installation, installation_repositories
- Vercel Sandbox integration: clone, install (ignore-scripts), build, extract
- Live build log streaming via SSE from API → UI
- Build cache (node_modules tarball keyed by lockfile hash)
- Preflight integration for GitHub sources
- `shippie.json` support: read, validate, use in build
- Auto-deploy on push to configured branch

### Week 7 — Discovery + Leaderboards
- Storefront feeds by project type (app / web_app / website shelves)
- Full-text search with FTS + pg_trgm
- Ranking engine: hourly cron, weighted formulas per type
- Leaderboards: new_and_hot, most_installed, most_loved, rising, best_updated_week
- Categories, filters, trending
- App detail page: hero, install UX, screenshots, maker info, trust metadata, permissions, changelog, feedback summary
- QR code generator on detail page (install on phone)
- Maker profiles
- Brand impersonation / trademark check job

### Week 8 — Unified Feedback + Install UX
- `feedback_items` schema with types: comment, bug, request, rating, praise
- SDK: `shippie.feedback.open()` + `shippie.feedback.submit()`
- Worker: `/__shippie/feedback` endpoints
- Maker feedback inbox: typed view, status updates, duplicate merging, maker responses
- Public changelog on detail page (maker replies to feedback)
- Install UX: Android beforeinstallprompt handler, iOS A2HS guide, display-mode detection
- `shippie.install.prompt()` + device-aware install tracking in `device_installs`
- Platform PWA itself (install Shippie to phone, browse your library)
- Reports + moderation admin panel

### Week 9 — Analytics + Polish + Phase-2 Scaffolds
- Analytics events: partitioned table, hourly rollup, 90d retention
- SDK: `shippie.track(event, props)` via `__shippie/analytics`
- Maker analytics dashboard: basic charts (views, sessions, installs, funnel)
- File uploads via SDK (presigned R2 URLs) with per-user quota
- Rate limiting across all public endpoints (IP + user + app)
- GDPR data export per user + per app
- Session key rotation helpers (dual-key)
- Phase-2 schemas built but not wired: `push_subscriptions`, `notifications_outbox`
- Error monitoring (Sentry), uptime checks, DB backups automation
- Content moderation flow: takedown, warning, archive with audit trail

### Week 10 — Launch
- Landing page polish, value prop demo video, "apps on your phone" messaging
- Seed 15–20 apps across all three types
- SEO: dynamic OG images, meta tags, sitemap, robots.txt
- `shippie.app` PWA install prompt for the platform itself
- Production deploy + smoke tests
- Beta invites: 20 makers from vibe-coding communities
- Monitor, fix, iterate
- Set up public changelog + roadmap on shippie.app/changelog

---

## Edge Cases (Baked into the Plan)

| # | Case | Mitigation |
|---|------|-----------|
| 1 | Slug squatting / brand impersonation | `reserved_slugs` table seeded; trademark check on new deploys; admin reassignment flow |
| 2 | Reserved `__shippie/*` collision in maker files | Preflight rejects; Worker always serves system paths first |
| 3 | Maker ships own `manifest.json` / `sw.js` | `conflict_policy` in shippie.json determines behavior (shippie/merge/own) |
| 4 | SSR/server code in a static type | Preflight detects Next.js API routes, `fs.writeFileSync`, server-only imports; warns or blocks |
| 5 | Monorepo root detection fails | `build.root_directory` in shippie.json; UI prompts during connect flow |
| 6 | Build output missing index.html | Validator rejects (unless type=website with custom entry) |
| 7 | Huge images / source maps | 200MB size limit; Pro tier higher; warnings at 100MB |
| 8 | Env vars build-time vs client | `env_build` allowlist in shippie.json; server-only vars never shipped to client |
| 9 | App needs secret for external API | Not supported in MVP — app must have its own backend or use public APIs; roadmap: server-side proxy via `__shippie/proxy` |
| 10 | Popup blocked during signIn | Fallback to full-page redirect with return_to |
| 11 | Safari iOS standalone mode differences | Detect via `display-mode: standalone`; iOS-specific session cookie handling; no `beforeinstallprompt` |
| 12 | iOS 7-day storage clear | Service worker re-registration; warn user if last_seen_at > 5d |
| 13 | Malicious feedback spam / vote brigading | Rate limits per IP + user; burst detection; shadow-ban for suspicious patterns |
| 14 | Bad deploy shipped to live users | Atomic version swap = 1-click rollback; auto-rollback on error rate spike |
| 15 | App deletion while users have it installed | 30d grace period + banner + data export; then permanent; subdomain returns "unavailable" |
| 16 | App renamed / slug changed after installs | Slug changes require admin approval; old slug becomes redirect for 90 days |
| 17 | Multi-device session revocation | `app_sessions` table lists devices; revoke individually or all |
| 18 | Desktop → mobile handoff | QR code on every install surface; platform OAuth works identically on phone |
| 19 | Refresh token reuse attack | Refresh token rotation + reuse detection → revoke all sessions for user+app |
| 20 | CSP violation from maker code | CSP set by Worker; allowed domains declared in shippie.json; violations logged |
| 21 | Preflight false negative (malicious postinstall) | `npm ci --ignore-scripts` + 72h quarantine + Vercel Sandbox hardware isolation |
| 22 | Build timeout (infinite loop) | 10min hard timeout + CPU/RAM limits |
| 23 | Quota exhaustion (storage abuse) | 429 with clear error; maker dashboard shows quota; upgrade path |
| 24 | Concurrent writes to same app_data key | Partial unique indexes; UPSERT; last-write-wins with `updated_at` |
| 25 | Analytics volume explodes | Monthly partition + 90d TTL + hourly rollups; per-app event rate limit |
| 26 | Service worker stuck on old version | Version-named caches; network-first HTML; banner prompts refresh |
| 27 | Takedown while app is in user's home screen | App returns 410 Gone with maker contact; SW fetches fail gracefully |
| 28 | GitHub repo renamed / deleted | Webhook detects; app moves to `takedown` pending maker action |
| 29 | Maker account deleted | Apps archived; 30d grace; all data export emailed |
| 30 | Fake installs inflation | Device fingerprint + heuristic validation (a2hs_confirmed + display_mode_standalone_seen before counted) |
| 31 | Native module build failure | Preflight warns; build log surfaces the error clearly; sandbox has common toolchains pre-installed |
| 32 | Unverified maker impersonation | Public "unverified" badge; verified badge requires GitHub App install + repo match |
| 33 | User revokes consent mid-session | `oauth_consents.revoked_at` checked; next request fails with 401; app prompts re-consent |
| 34 | Cookie domain mismatch on custom domains (Phase 2 Pro) | Session binds to canonical host; custom domain gets fresh session via OAuth flow |
| 35 | Worker KV replication lag on version swap | Accept eventual consistency; show "deploying" state for ~30s after publish |

---

## Key Risks (Ranked)

1. **Worker + cookie session crypto correctness** (HIGH) — get AES-GCM, HMAC, key rotation right from day 1 or we re-platform auth. Shared `session-crypto` package + exhaustive tests. Budget Week 1 + Week 4.
2. **Preflight completeness** (HIGH) — missing a check ships a security hole. Treat preflight as its own test suite with 50+ cases.
3. **Vercel Sandbox regional limits** (MEDIUM) — US-East only at GA. Acceptable for MVP; EU makers see slower builds.
4. **Wildcard SSL via Advanced Certificate Manager** (MEDIUM) — $10/mo dependency on Cloudflare; fallback is Let's Encrypt DNS-01 automation.
5. **Ranking formula gaming** (MEDIUM) — launch with conservative weights, adjust after 30d of real data. Maker actions discounted.
6. **Cold-start marketplace** (MEDIUM) — ship 15+ apps yourself before invites go out. Wave 2 is targeted recruiting.
7. **Postgres multi-tenant scaling** (LOW for MVP) — fine until ~1000 apps / 10M app_data rows; partition by app_id later if needed.
8. **iOS PWA limitations** (LOW but visible) — no bg sync, no aggressive install prompts. Transparent "works best on Android" notes.

---

## Cost Estimate (MVP scale)

| Line | Cost/mo |
|------|---------|
| Vercel Pro (platform + Sandbox credits) | $20 |
| Hetzner CCX23 (Postgres only) | €15 |
| Cloudflare Workers Paid (wildcard routes, Worker compute) | $5 |
| Cloudflare Advanced Certificate Manager | $10 |
| Cloudflare R2 (free tier at MVP) | $0 |
| Vercel Sandbox overage (~100 builds/day) | $0–$12 |
| Resend (email) | $20 |
| Sentry (error monitoring) | $0–$26 |
| Domain + misc | $5 |
| **Total** | **~$75–$113** |

---

## Verification Plan

1. **Deploy a static zip** → live at `{slug}.shippie.app` in <60s with manifest, SW, SDK all auto-injected
2. **Deploy a Vite React app from GitHub** → live with PWA features in <3min
3. **Install to phone** → Android install prompt works, iOS A2HS guide shown, app opens fullscreen, SW cached
4. **Sign in** → `shippie.auth.signIn()` triggers OAuth flow, ends with app-origin session cookie, `getUser()` returns user
5. **Same-origin SDK storage** → `shippie.db.set("recipes", "1", {...})` persists and `get("1")` returns it
6. **Cross-app isolation** → malicious app deployed as `evil.shippie.app` cannot read `recipes.shippie.app` data (RLS blocks; different app_id in session cookie)
7. **Session cookie theft resistance** → XSS in maker code cannot read `__shippie_session` cookie (httpOnly)
8. **Device revocation** → sign in on two devices, revoke one in dashboard, that device's next request returns 401
9. **Rollback** → deploy v2, rollback to v1, KV pointer flips, v1 served immediately
10. **Preflight blocks `__shippie/` collision** → deploy a zip containing `__shippie/sdk.js` → rejected with clear error
11. **Preflight blocks postinstall attack** → package with malicious postinstall → blocked by `--ignore-scripts`
12. **Build timeout** → infinite-loop build → killed at 10min
13. **Quota exhaustion** → 10001st row in app_data → 429 with error
14. **Service worker update** → redeploy → user gets prompt on next open
15. **Leaderboard ranking** → submit fake upvotes from burst → flagged, excluded from rank
16. **Feedback flow** → submit bug, vote on it, maker responds, changelog reflects on detail page
17. **QR install handoff** → scan QR on desktop → phone opens install screen → install works
18. **Manifest conflict (own policy)** → deploy app with `conflict_policy: own` → maker's manifest kept, platform warning shown
19. **Slug squatting blocked** → try to create `admin`, `shippie`, or a known brand → rejected
20. **GDPR export** → request data export for user X → email delivered with JSON dump across all apps

---

## Decisions Locked In

1. **Build runner**: Vercel Sandbox (Firecracker microVMs)
2. **Platform hosting**: Vercel for Next.js; Hetzner for Postgres only; Cloudflare Tunnel between them
3. **GitHub integration**: GitHub App (not OAuth App)
4. **SDK distribution**: Both `@shippie/sdk` on npm and hosted at `cdn.shippie.app/sdk/v1.latest.js` + `/__shippie/sdk.js` same-origin proxy
5. **Auth architecture**: Worker-managed app-origin sessions via OAuth 2.0 + PKCE, encrypted httpOnly cookies, same-origin `__shippie/*` routes for all SDK traffic
6. **Project types**: `app`, `web_app`, `website` — first-class from day 1
7. **Declarative config**: `shippie.json` required (auto-drafted if missing)
8. **Version model**: atomic pointer swap in KV for zero-downtime deploy + instant rollback
9. **Feedback model**: unified `feedback_items` typed system (comment, bug, request, rating, praise)
10. **Email**: Resend
11. **Search**: Postgres FTS + pg_trgm
12. **Ranking**: weighted per-type formulas, hourly cron, maker actions discounted
