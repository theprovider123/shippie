# Shippie — Implementation Plan (v4)

## Context

Shippie is "apps on your phone, without the App Store." It owns the full shipping loop: connect repo or upload files → detect framework → auto-package → safety check → inject runtime → generate listing surfaces → publish same-origin at `{slug}.shippie.app` and on `shippie.app`. If a repo is clean and compatible, it goes live automatically. If it's risky or incomplete, Shippie does as much packaging as possible and only stops on real safety/runtime blockers.

**v4 is a targeted rewrite against Codex review feedback.** The invariant from v3 stands. The changes tighten auth, fix the consistency model, make Quick Ship the default, add Shippie Functions for secret-backed apps, add an auto-packaging layer, add business foundations, and move trust from presentational to enforced.

---

## The Invariant (unchanged from v3)

> **Every project deployed on Shippie becomes a Shippie-managed runtime on its own origin, with reserved same-origin system routes under `__shippie/*`.**

`shippie.app` is the control plane. `*.shippie.app` is the runtime plane. The Cloudflare Worker owns `__shippie/*` on every app origin. SDK calls are same-origin. Sessions are app-origin httpOnly cookies. Worker is the trust boundary.

---

## What Changed From v3

| Area | v3 | v4 |
|------|----|----|
| **Secret-backed apps** | Not supported; "bring your own backend" | **Shippie Functions** at launch via Cloudflare Workers for Platforms |
| **App session cookie** | Encrypted claim-bearing cookie; Worker + platform share crypto | **Opaque session handle** → server-side lookup in `app_sessions` |
| **Version pointer** | KV as source of truth, eventually consistent | **Postgres is source of truth**, KV is read-through cache |
| **Deploy mode** | Preview-first + maker publishes | **Quick Ship default**: publish on preflight pass unless opt-in to preview |
| **Build contract** | npm-centric | First-class npm/pnpm/yarn/bun + framework presets for Vite/Astro/Next/Nuxt/SvelteKit/etc. |
| **Missing metadata** | Blocks launch (preflight rejects) | **Auto-packaged**: icon, screenshots, copy, changelog, install QR, permissions page |
| **Business foundations** | Absent | Orgs, roles, private/internal distribution, audit log, verified business — schema from day 1 |
| **Trust model** | Presentational (badges on listing) | **Enforced**: outbound allowlist, permission-to-runtime, malware/scan, source provenance, support/privacy required for public |

---

## 1. Shippie Functions — Per-App Server Capability

### Why
A huge class of useful vibecoded apps needs to call external APIs with a secret (Stripe, OpenAI, a private DB, a CRM). Without server capability, Shippie either blocks those apps or pushes makers to set up their own backend — contradicting "one-shot live."

### How (MVP): Cloudflare Workers for Platforms
- **CFW4P** runs user-provided Workers dispatched from our main Worker. Each app's function code is deployed as a user Worker in a dispatch namespace. Per-app env bindings hold secrets — the maker's code never sees the raw secret, it accesses it via `env.STRIPE_KEY`.
- **V8 isolate boundary** = same hardware isolation as CF's edge. Hostile app code cannot escape to another app or to the platform.
- **Outbound fetch is wrapped** by a Shippie runtime shim that enforces the `allowed_connect_domains` allowlist from `shippie.json`. Requests to anything else return 403.
- **Built-in limits**: 50ms CPU, 128MB memory, max subrequests per request. Shippie tightens further via Worker metadata.
- **Logs** via Tail Workers → pushed to Postgres `function_logs` for maker dashboard.
- **Cost**: CFW4P subscription is $25/mo flat + per-request pricing. Reasonable for MVP and scales linearly.

### Shape
```
repo/
├── functions/              # Shippie Functions directory (TypeScript or JavaScript)
│   ├── subscribe.ts        # POST /__shippie/fn/subscribe
│   ├── ai/chat.ts          # POST /__shippie/fn/ai/chat
│   └── webhook.ts          # POST /__shippie/fn/webhook (external webhooks)
├── index.html
└── shippie.json            # declares function secrets + allowlist
```

```ts
// functions/subscribe.ts
import type { ShippieFunctionContext } from '@shippie/functions';

export default async function handler(ctx: ShippieFunctionContext) {
  // ctx.user      → authenticated Shippie user (or null)
  // ctx.env       → per-app secrets (STRIPE_KEY, etc.)
  // ctx.request   → incoming Request
  // ctx.db        → same-origin Shippie DB (RLS-scoped to user+app)
  // ctx.fetch     → allowlisted fetch (blocks non-allowed domains)
  // ctx.log       → structured logging

  const stripe = new Stripe(ctx.env.STRIPE_KEY);
  const sub = await stripe.subscriptions.create({ customer: ctx.user.id });
  await ctx.db.set('subscriptions', sub.id, sub);
  return Response.json({ ok: true, subscription_id: sub.id });
}
```

### `shippie.json` additions
```jsonc
{
  "functions": {
    "enabled": true,
    "directory": "functions",
    "runtime": "workers",                  // future: "vercel" for migration path
    "env": {
      "STRIPE_KEY":   { "required": true,  "secret": true },
      "OPENAI_KEY":   { "required": false, "secret": true }
    }
  },
  "allowed_connect_domains": [
    "api.stripe.com",
    "api.openai.com"
  ]
}
```

### Reserved Routes (added)
```
__shippie/fn/*             POST/GET/PUT/DELETE — invokes matching function handler
__shippie/fn/_health       GET — returns per-app function runtime status
```

### Secrets Management
- Secrets stored encrypted at rest in `function_secrets` table (per app), accessed only by the dispatcher at Worker deploy time
- Maker sets secrets via dashboard or CLI (`shippie env add STRIPE_KEY=...`)
- Secrets never appear in build logs, deploy artifacts, or anywhere else
- Secret rotation via dashboard with automatic Worker re-deploy

### Quotas + Billing
| Tier | Function invocations/day | CPU time/request | Secrets | Outbound egress |
|------|--------------------------|------------------|---------|-----------------|
| Free | 10,000 | 50ms | 5 | 1GB/day |
| Pro | 500,000 | 500ms | 50 | 100GB/day |
| Team | 5M | 500ms | 500 | 1TB/day |

### Trust + Safety
- Function code goes through the same preflight as static code
- Outbound allowlist is the main security boundary (can't exfiltrate to attacker-controlled endpoints)
- Static analysis flags: unallowed fetch targets, eval usage, dynamic imports from URLs, crypto mining patterns
- Every function has a request log visible to the maker + platform admin

---

## 2. Auth — Opaque Session Handle Model

### The fix
v3 used an encrypted cookie containing signed claims (uid, aid, sid, scope, exp). Any crypto mistake — wrong cipher mode, weak key rotation, signing bypass — affects every app session. v4 uses an **opaque session handle** backed by a server-side row.

### Primitives
- **Platform session** — httpOnly cookie on `shippie.app` only. First-party to the control plane.
- **App session handle** — opaque random string stored as `__shippie_session` cookie on `{slug}.shippie.app`. Nothing else. No claims inside the cookie.
- **app_sessions row** — holds user_id, app_id, scope, device info, expiry, revocation status. Indexed by `handle_hash` (argon2 or SHA-256 of the handle).

### Session Cookie
```
Set-Cookie: __shippie_session=<32 bytes base64url>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
```
- No encryption. No claims. Opaque to everyone including the Worker.
- Rotated on significant events (privilege change, new device, long-running session).

### OAuth Flow (updated)
```
1. App: shippie.auth.signIn(return_to)
   ↓
2. Browser → /__shippie/auth/login?return_to=...
   ↓
3. Worker stores PKCE + state in KV (60s TTL), redirects to
   https://shippie.app/oauth/authorize?client_id=...&redirect_uri=...
     &code_challenge=...&state=...&scope=auth storage files analytics
   ↓
4. Platform handles sign-in/consent, redirects:
   https://{slug}.shippie.app/__shippie/auth/callback?code=...&state=...
   ↓
5. Worker:
    - validates state from KV
    - POST https://shippie.app/api/internal/oauth/token (signed)
      { code, code_verifier, client_id, device_info }
    - platform verifies PKCE, inserts app_sessions row, returns { handle }
    - Worker sets __shippie_session=<handle> cookie
    - redirects to return_to
   ↓
6. On subsequent __shippie/storage/* calls:
    - Worker reads cookie, forwards handle to platform:
      POST /api/internal/session/authorize
      Headers: X-Shippie-Signature (HMAC of body + timestamp)
      Body: { handle, target: "storage/recipes/123", method: "PUT", body_hash }
    - Platform: looks up app_sessions by handle_hash, checks expiry/revocation,
      returns { user_id, app_id, scope } or 401
    - Worker proxies the request to the appropriate internal endpoint
      with the resolved context
```

### Caching
- Worker caches session resolutions in KV for 60 seconds, keyed by `handle_hash`
- Revocation invalidates the cache entry immediately
- Hot path: 1 KV get + 1 internal API call per SDK request (≤100ms typical)

### Revocation Is Simple
- User revokes a device → `UPDATE app_sessions SET revoked_at = now() WHERE id = ?`
- Worker cache TTL ≤ 60s → revocation visible everywhere within a minute
- Immediate revocation: publish to CF Durable Object broadcast or Worker KV with `cf.cacheTtl=0`

### Blast Radius
A bug in the auth system now leaks only: the cookie value (which is useless without the DB). Compare to v3 where a bug leaks decryption of every session token. Much smaller radius.

---

## 3. Strongly Consistent Version Pointer

### The fix
v3 had KV as the source of truth for `apps:{slug}:active → "v42"`. KV is eventually consistent (~30s global). That's fine for a cache, not for "instant rollback."

### v4 model
- **Postgres `apps.active_version` is the source of truth.** Transactional writes, instantly consistent for the platform API.
- **KV is a read-through cache.** Worker reads `apps:{slug}:active` from KV first; on miss, calls platform API `/api/internal/version/{slug}` which reads Postgres, returns, and Worker writes back to KV with a short TTL (60s).
- **Publish / rollback flow**:
  1. Platform writes `apps.active_version = v43` inside a transaction
  2. Platform fires an async job to invalidate KV key `apps:{slug}:active` (purge) and write the new value
  3. Platform also publishes a Cloudflare Durable Object broadcast so all Worker instances drop their in-memory cache immediately
  4. Worker receives broadcast or falls through to KV read-through, which now hits the refreshed value
- **Instant rollback**: UI button → platform updates Postgres row → broadcast → all traffic serves the previous version within ~2 seconds, not ~30.
- **Cold edge case**: if KV + broadcast both fail, Worker falls back to a direct platform API call per request. Slower but correct.

### Schema
```sql
alter table apps
  add column active_version int,
  add column preview_version int,
  add column active_artifact_id uuid references deploy_artifacts(id);

-- Index for fast slug → version lookup
create index apps_slug_active_idx on apps (slug) include (active_version, active_artifact_id);
```

---

## 4. Quick Ship — Publish by Default

### The fix
v3 defaulted to preview-first, maker clicks publish. v4 reverses that for public/unlisted projects.

### Rules
- **Quick Ship (default)**: if `preflight.status == "passed"` AND `visibility != "private"` AND not explicit `--preview` → publish immediately. App goes live at `{slug}.shippie.app`, listing created on `shippie.app`.
- **Preview-first (opt-in)**: maker sets `"deploy_mode": "preview"` in `shippie.json` or toggles in dashboard. Useful for apps with active users that need validation before flipping. Also default for business/org-owned apps above a certain trust tier.
- **Quick Ship with warnings**: if preflight emits warnings (not blockers), publish anyway but surface warnings prominently in the deploy log and on the detail page until resolved.
- **Blocked**: preflight blockers prevent any publish. Examples: malware detected, reserved path collision, hard resource limit exceeded.

### `shippie.json`
```jsonc
{
  "deploy_mode": "quick_ship",     // "quick_ship" | "preview" | "manual"
  "auto_publish_on": ["main"]      // auto-publish pushes to these branches only
}
```

### Detail Page States
- `live` — visible on marketplace
- `unlisted` — live but not in discovery feeds (search still finds via direct slug)
- `preview` — internal URL only, not on `{slug}.shippie.app` canonical

---

## 5. Broader Build Contract

### The fix
v3 assumed `npm ci && npm run build`. Real repos use pnpm, yarn, bun, multiple frameworks, and AI-tool templates. Make detection first-class.

### Package Manager Detection
| Lockfile | Install | Build |
|----------|---------|-------|
| `package-lock.json` | `npm ci --ignore-scripts` | `npm run build` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile --ignore-scripts` | `pnpm build` |
| `yarn.lock` | `yarn install --immutable --mode skip-build` | `yarn build` |
| `bun.lockb` / `bun.lock` | `bun install --frozen-lockfile --ignore-scripts` | `bun run build` |
| None | `npm install --ignore-scripts` (warned) | Best-effort |

### Framework Presets (auto-detected)
| Signal | Framework | Output dir | Notes |
|--------|-----------|-----------|-------|
| `next.config.*` + `output: "export"` | Next.js (static) | `out` | Only static exports in MVP |
| `next.config.*` (SSR) | Next.js (SSR) | — | Rejected in `app` type; flagged for migration |
| `vite.config.*` | Vite | `dist` | |
| `astro.config.*` | Astro | `dist` | Runtime `output` detected |
| `nuxt.config.*` | Nuxt | `.output/public` (generate) | Only static in MVP |
| `svelte.config.js` + `adapter-static` | SvelteKit | `build` | |
| `remix.config.js` + `unstable_vitePlugin` | Remix (SPA) | `public` | |
| `solid.config.js` | SolidStart | `.output/public` | |
| `lit.config.*` or Lit deps | Lit | `dist` | |
| `_config.yml`, `_layouts/` | Jekyll | `_site` | |
| `config.toml` + `content/` | Hugo | `public` | |
| `package.json` only, no framework | Static | `dist` / `build` / `public` / repo root | |
| `index.html` at root, no package.json | Pure HTML | repo root | No build step |

### AI-Tool Repo Patterns (detected, defaults applied)
- `.bolt/` directory → Bolt project, apply Vite defaults
- `.lovable/` directory → Lovable project, apply their conventions
- `.cursorrules`, `.cursor/` → no-op signal
- `components.json` (shadcn) → additional Tailwind + postcss handling
- `v0/` or `.v0/` → v0.dev template, apply Next.js static defaults

### Monorepo Detection
- `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `workspaces` in root `package.json` → detect monorepo, prompt for `root_directory`
- `shippie.json` in a subdirectory overrides monorepo inference

### Output Validation
- Accept first of: `dist`, `build`, `out`, `.output/public`, `public`, `_site`, repo root (fallback)
- Must contain an entry file: `index.html` for types `app` and `web_app`; any file for type `website`

---

## 6. Auto-Packaging Layer

### Why
This is where Shippie differentiates. Missing icon, screenshots, description, changelog should NOT block a launch. Shippie generates the boring app-store-like stuff that vibecoders hate doing.

### What gets auto-generated
| Asset | Sources (in order of preference) | Fallback |
|-------|----------------------------------|----------|
| **Icon** | `./icon.png`, `public/icon.png`, `favicon.png` at ≥512px → uploaded icon | OG image in HTML `<meta>`; first square image in `public/`; screenshot crop; **AI-generated** from name+description+theme_color via DALL·E/SD |
| **Screenshots** | `public/screenshot-*.png`, `shippie.json.pwa.screenshots` | **Post-deploy capture** via headless Chrome on 390×844 (mobile), 1280×800 (desktop); 3 frames from different routes or viewport scrolls |
| **Manifest** | Maker's `manifest.json` (merged per conflict_policy) | Generated from app metadata + theme_color + icon |
| **Listing copy** | README title/description; `shippie.json` fields | AI-summarized from README + build artifacts; 1-line tagline + 3-sentence description |
| **Changelog** | Git commit messages since last deploy | Extracted from `CHANGELOG.md`; else "Initial release" |
| **Install QR** | Always generated per app | — |
| **Permissions page** | `shippie.json.permissions` + static analysis of SDK calls in code | Inferred from build artifacts |
| **Compatibility report** | Static analysis of SDK usage vs `shippie.json` | — |
| **OG social card** | Auto-rendered from icon + name + tagline + theme_color | — |

### Screenshot Capture Job
After a successful deploy, platform fires a background job (Vercel Cron + Sandbox or dedicated worker):
1. Spin up headless Chrome against the new `{slug}.shippie.app` URL
2. Capture 3 viewports: mobile portrait (390×844), mobile landscape (844×390), desktop (1280×800)
3. Also capture a "hero" shot at 1200×630 for OG cards
4. Upload to R2 under `public-assets/{app_id}/screenshots/v{version}/`
5. Update `apps.screenshot_urls` array
6. Re-generate the listing detail page

### AI Icon + Copy Generation
- Uses an LLM+image model call with strict prompting: "Generate a minimalist app icon for {name}. Theme color: {hex}. Category: {category}. Must be simple, recognizable at 64px, no text."
- For copy: "Write a 1-line tagline and 3-sentence description for {name}, a {type} that {description}. Tone: clear, practical."
- Gated behind a feature flag; makers can regenerate or override
- Cost-controlled: only called if nothing else worked

### Compatibility Report (shipped on every listing)
```
Compatibility: ★★★★☆ (Good)

✓ Auth enabled — sign-in works
✓ Storage enabled — data persists per user
✓ Feedback enabled — users can report issues
✓ Analytics enabled — anonymized usage tracked
⚠ Notifications requested but service worker not registered
✗ File uploads not declared in shippie.json but code uses shippie.files.upload (will fail at runtime)
```

---

## 7. Business Foundations (Schema Now, UI Later)

### Why
If businesses are a real future lane — and "apps on your phone" is attractive to internal tools — you need org primitives from day 1. Retrofit is painful.

### Organizations
```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  plan text default 'free',              -- free | pro | team | business | enterprise
  billing_customer_id text,              -- Stripe / Lemon Squeezy
  verified_business boolean default false,
  verified_at timestamptz,
  verified_domain text,                  -- DNS TXT verified
  support_email text,
  privacy_policy_url text,
  terms_url text,
  data_residency text default 'eu',      -- eu | us | global
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table organization_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'developer', 'viewer')),
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

-- Apps can belong to an org OR a user
alter table apps
  add column organization_id uuid references organizations(id) on delete cascade,
  add column visibility_scope text default 'public'    -- public | unlisted | private_org | private_link
    check (visibility_scope in ('public', 'unlisted', 'private_org', 'private_link'));

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,                   -- app.published, member.added, secret.updated, ...
  target_type text,                       -- app | member | secret | deploy | ...
  target_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz default now()
);
create index audit_log_org_created_idx on audit_log (organization_id, created_at desc);
```

### Roles + Permissions (in code, gated by middleware)
| Role | Can |
|------|-----|
| `owner` | Everything, including billing + delete org |
| `admin` | Manage members, apps, secrets; can't delete org |
| `developer` | Create/edit apps, deploy, manage feedback |
| `viewer` | Read-only access to dashboards + analytics |

### Verified Business Tier
- DNS TXT verification for a domain
- Business documents review (light-touch; can be manual admin approval in MVP)
- Gets a "Verified Business" badge on all org apps
- Unlocks: custom domains, SSO (Phase 2), higher quotas, support SLAs

### Private / Internal Distribution
- `visibility_scope = "private_org"` → only org members can access `{slug}.shippie.app`
- Worker checks session cookie against org membership via internal API
- `visibility_scope = "private_link"` → anyone with the signed link can access (shareable for beta testers)

---

## 8. Trust — Enforced, Not Presentational

### What gets enforced (not just displayed)

**Source provenance**
- GitHub repo → requires GitHub App install, maker must be an admin of the repo or its owner
- Commit author matching flagged if multiple unknown contributors
- Uploaded zip → unverified badge, cannot reach verified tier
- Verified maker tier requires 2FA + GitHub account verification

**External domain scanning**
- Static AST walk of build output and function code: extracts every fetch/XHR target + CSP-relevant URLs
- Compared against `allowed_connect_domains`: any domain not in the list produces a warning on deploy and a strict CSP at runtime
- Runtime CSP enforces outbound connections — not just the function runtime but the in-browser app code
- Periodic re-scan of deployed artifacts flags regressions

**Permission-to-runtime enforcement**
- `shippie.json.permissions` declares what SDK features the app may use
- SDK calls validated at the `__shippie/*` layer: if `permissions.files = false` but code calls `shippie.files.upload`, the endpoint returns 403 and surfaces the violation on the compatibility report
- Function secrets only injected if `permissions.functions = true`

**Malware + file scanning**
- Upload pipeline runs ClamAV (via Vercel Sandbox utility) on the extracted build output
- Static analysis for known patterns: obfuscated JS, crypto miners, dynamic `eval`/`Function()`, suspicious network calls, known IoC domains
- Known-bad hashes block deploy outright
- Suspicious patterns surface as warnings; 2+ warnings require maker acknowledgment before publish

**Privacy + support surfaces (required for public listing)**
- To reach `visibility = public`, app must have:
  - `support_email` (or org `support_email`)
  - `privacy_policy_url` or opt-in to Shippie's standard privacy page
  - Category and age rating
  - Short description (auto-generated OK)
- Unlisted / private apps do not require these

**Business verification**
- Verified Business tier unlocks: custom domains, SSO, higher quotas, audit log exports
- Verification is enforced via DNS + document check, not just a badge

---

## 9. Reserved Route Contract (additions)

```
# Core system
__shippie/sdk.js                GET
__shippie/manifest              GET
__shippie/sw.js                 GET
__shippie/icons/{size}.png      GET
__shippie/meta                  GET
__shippie/health                GET

# Auth
__shippie/auth/login            GET
__shippie/auth/callback         GET
__shippie/auth/logout           POST
__shippie/auth/revoke           POST
__shippie/session               GET/DELETE

# Storage
__shippie/storage/:collection           GET
__shippie/storage/:collection/:key      GET/PUT/DELETE
__shippie/storage/public/:collection    GET

# Files
__shippie/files                 POST (presigned upload)
__shippie/files/:key            GET/DELETE

# Feedback
__shippie/feedback              POST/GET
__shippie/feedback/:id/vote     POST

# Analytics
__shippie/analytics             POST

# Install
__shippie/install               GET/POST

# NEW: Functions
__shippie/fn/*                  GET/POST/PUT/DELETE  (user Worker)
__shippie/fn/_health            GET
__shippie/fn/_logs              GET                   (maker-auth only)
```

---

## 10. Deploy Pipeline (Quick Ship + Auto-Packaging)

```
Source ready (GitHub clone or zip extracted to R2 staging)
  ↓
Detect package manager + framework + shippie.json (or auto-draft)
  ↓
PREFLIGHT
  - slug rules + reserved slugs
  - reserved __shippie/* path collision
  - manifest/SW conflict vs policy
  - unsupported patterns (SSR in app type, etc.)
  - size limits
  - package age (72h quarantine)
  - secret leakage scan
  - malware static analysis + ClamAV
  - CSP/allowlist validation
  ↓
  {blockers}? → FAIL, surface errors, end
  {warnings}?  → continue, carry warnings to listing
  ↓
BUILD (Vercel Sandbox; skipped for pre-built static)
  - install with detected package manager, --ignore-scripts
  - execute build command with detected framework preset
  - stream logs via SSE
  - extract build output from detected output dir
  ↓
FUNCTIONS BUILD (if functions/ present)
  - compile each function into a Worker script
  - bundle runtime shim (fetch allowlist, ctx.env, ctx.db, ctx.log)
  - deploy to CFW4P dispatch namespace under app-scoped name
  - attach secrets from function_secrets
  ↓
PWA INJECTION
  - manifest, meta tags, SDK script (same-origin /__shippie/sdk.js), SW registration
  - per-app CSP meta tag
  - icon resizing
  ↓
AUTO-PACKAGING (parallel, async, non-blocking for Quick Ship)
  - Icon fallback (uploaded → OG → AI-generated)
  - Listing copy generation (AI if missing)
  - Compatibility report
  - Kicked off but not required for publish (app can go live while packaging continues)
  ↓
UPLOAD
  - Upload all files to r2://shippie-apps/{slug}/v{version}/*
  - Build version manifest (files, hashes, sizes)
  ↓
POSTGRES WRITE (source of truth)
  - INSERT deploys row, deploy_artifacts row
  - UPDATE apps SET active_version = v{version}, active_artifact_id = ... (Quick Ship path)
    OR UPDATE apps SET preview_version = ...                                    (Preview path)
  - audit_log entry
  ↓
KV + BROADCAST
  - Write apps:{slug}:active = v{version}
  - Broadcast version swap via Durable Object to all Worker instances
  ↓
POST-DEPLOY (async)
  - Screenshot capture job
  - External domain re-scan
  - Warm cache (fetch / and /__shippie/sdk.js)
  - Update listing detail page
  - Email/notify maker
  ↓
LIVE at {slug}.shippie.app
+ listing at shippie.app/apps/{slug}
```

### Quick Ship timing targets
- Static zip upload: **< 45s to live**
- GitHub static project: **< 2.5 min to live**
- GitHub Vite/Next static: **< 3 min to live**
- With functions: **+30-60s for CFW4P dispatch**

---

## 11. Data Model — Full (v4 additions)

Changes vs v3 are marked. Full schema elided for brevity where unchanged.

### NEW: Shippie Functions
```sql
create table function_deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid not null references deploys(id) on delete cascade,
  worker_name text not null,              -- CFW4P dispatch name
  bundle_hash text not null,
  allowed_domains text[] not null,
  env_schema jsonb not null,
  deployed_at timestamptz default now()
);

create table function_secrets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  key text not null,
  value_encrypted text not null,           -- AES-GCM with platform key
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (app_id, key)
);

create table function_logs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid references deploys(id),
  path text not null,                      -- /__shippie/fn/subscribe
  method text not null,
  status int,
  duration_ms int,
  cpu_time_ms int,
  user_id uuid,
  error text,
  metadata jsonb,
  created_at timestamptz default now()
) partition by range (created_at);
-- 30 day retention, monthly partitions
```

### CHANGED: Apps
```sql
alter table apps
  add column organization_id uuid references organizations(id) on delete cascade,
  add column visibility_scope text default 'public'
    check (visibility_scope in ('public', 'unlisted', 'private_org', 'private_link')),
  add column deploy_mode text default 'quick_ship'
    check (deploy_mode in ('quick_ship', 'preview', 'manual')),
  add column support_email text,
  add column privacy_policy_url text,
  add column terms_url text,
  add column data_residency text default 'eu',
  add column compatibility_score int,      -- 0-100 from auto-packaging report
  add column screenshot_urls text[];
```

### CHANGED: App Sessions (opaque handle)
```sql
create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  handle_hash text unique not null,        -- SHA-256 of the opaque handle
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

### NEW: Organizations block (from §7 above) — included in schema

### NEW: External Domain Usage (trust enforcement)
```sql
create table app_external_domains (
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid not null references deploys(id) on delete cascade,
  domain text not null,
  source text not null,                    -- 'html' | 'js' | 'function' | 'manifest'
  allowed boolean not null,                -- matches allowed_connect_domains?
  first_seen_at timestamptz default now(),
  primary key (app_id, deploy_id, domain)
);
```

### CHANGED: Deploy with preflight report
```sql
alter table deploys
  add column preflight_status text,        -- passed | warned | blocked
  add column preflight_report jsonb,
  add column autopackaging_status text,    -- pending | partial | complete
  add column autopackaging_report jsonb;
```

(All v3 schema for apps, app_data, feedback_items, leaderboards, analytics, quotas, oauth_*, reserved_slugs, device_installs, etc. carries over — omitted here for brevity.)

---

## 12. Project Structure (updated)

```
shippie/
├── apps/
│   └── web/                              # Next.js 16 — control plane on Vercel
│       ├── app/
│       │   ├── (marketing)/
│       │   ├── (storefront)/
│       │   ├── (dashboard)/
│       │   │   ├── apps/
│       │   │   ├── functions/            # NEW: Function logs, secrets UI
│       │   │   ├── feedback/
│       │   │   ├── analytics/
│       │   │   ├── orgs/                 # NEW: Org management
│       │   │   └── settings/
│       │   ├── (auth)/
│       │   ├── oauth/
│       │   └── api/
│       │       ├── auth/
│       │       ├── oauth/
│       │       │   ├── token/
│       │       │   └── consents/
│       │       ├── internal/             # Worker ↔ Platform endpoints (signed)
│       │       │   ├── session/
│       │       │   │   └── authorize/    # POST — resolve handle to claims
│       │       │   ├── sdk/
│       │       │   │   ├── storage/
│       │       │   │   ├── files/
│       │       │   │   ├── analytics/
│       │       │   │   └── feedback/
│       │       │   ├── version/          # NEW: GET /api/internal/version/{slug}
│       │       │   ├── install/
│       │       │   └── functions/
│       │       │       └── invoke-log/   # Function log ingestion from Tail Worker
│       │       ├── webhooks/github/
│       │       ├── deploy/
│       │       ├── admin/
│       │       ├── orgs/                 # NEW: org CRUD
│       │       └── cron/
│       │           ├── ranking/
│       │           ├── screenshots/      # NEW: headless capture job
│       │           ├── autopack/         # NEW: AI packaging job
│       │           ├── domain-rescan/    # NEW
│       │           └── quota-reset/
│       ├── lib/
│       │   ├── db/
│       │   ├── auth/
│       │   ├── oauth/
│       │   ├── session/                  # Opaque handle generation + lookup
│       │   ├── sandbox/
│       │   ├── r2/
│       │   ├── preflight/
│       │   │   ├── slug.ts
│       │   │   ├── reserved-paths.ts
│       │   │   ├── manifest-conflict.ts
│       │   │   ├── static-analysis.ts    # AST walk for fetch targets
│       │   │   ├── malware-scan.ts       # ClamAV integration
│       │   │   └── package-age.ts
│       │   ├── build/
│       │   │   ├── detect-pm.ts          # package manager detection
│       │   │   ├── detect-framework.ts   # framework presets
│       │   │   └── detect-ai-tool.ts     # Bolt/Lovable/v0 patterns
│       │   ├── pwa-injector/
│       │   ├── auto-package/             # NEW
│       │   │   ├── icon.ts
│       │   │   ├── screenshots.ts
│       │   │   ├── copy.ts
│       │   │   ├── compat-report.ts
│       │   │   └── og-card.ts
│       │   ├── functions/                # NEW
│       │   │   ├── bundler.ts            # esbuild bundle per function
│       │   │   ├── cfw4p.ts              # Workers for Platforms dispatch client
│       │   │   ├── secrets.ts
│       │   │   └── shim.ts               # runtime shim injected into user Workers
│       │   ├── trust/                    # NEW: enforcement primitives
│       │   │   ├── source-provenance.ts
│       │   │   ├── domain-scan.ts
│       │   │   ├── permission-enforce.ts
│       │   │   └── csp-builder.ts
│       │   ├── github/
│       │   ├── ranking/
│       │   └── orgs/                     # NEW: role checks
│       └── vercel.ts
│
├── packages/
│   ├── sdk/                              # @shippie/sdk
│   ├── functions-runtime/                # NEW: @shippie/functions type definitions + runtime shim
│   ├── db/                               # Drizzle
│   └── shared/
│
├── services/
│   └── worker/                           # CF Worker — main dispatcher
│       ├── src/
│       │   ├── index.ts
│       │   ├── router/
│       │   │   ├── files.ts
│       │   │   ├── system.ts
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
│       │   │   └── fn.ts                 # NEW: dispatch to CFW4P
│       │   ├── kv/
│       │   ├── session/
│       │   │   ├── cookie.ts             # opaque handle cookie
│       │   │   └── resolve.ts            # cached lookup via platform API
│       │   ├── platform-client.ts
│       │   ├── html-rewriter.ts
│       │   └── version.ts                # version pointer read-through cache
│       └── wrangler.toml
│
├── infra/
│   ├── hetzner/
│   ├── cloudflare/
│   │   ├── dns-notes.md
│   │   ├── tunnel-setup.md
│   │   ├── cfw4p-setup.md                # NEW: Workers for Platforms setup
│   │   └── durable-objects.md            # NEW: version broadcast DO
│   └── github-app/
│
├── docs/
│   ├── shippie-json-spec.md
│   ├── sdk-reference.md
│   ├── functions-guide.md                # NEW
│   ├── orgs-and-roles.md                 # NEW
│   ├── trust-model.md                    # NEW
│   └── conflict-policies.md
│
└── turbo.json
```

---

## 13. 12-Week Build Plan (v4)

Up from 10 to 12 weeks to absorb Functions + auto-packaging + org foundations.

### Week 1 — Foundation
- Monorepo: Next.js 16 + Drizzle + Auth.js v6 + Turborepo
- Vercel + Hetzner (Postgres + PgBouncer) + Cloudflare Tunnel
- Migrations: users, apps (+ new columns), organizations, org_members, audit_log, oauth_*, app_sessions (opaque), app_data w/ RLS, reserved_slugs
- Auth.js sign-in, platform layout, DNS + SSL

### Week 2 — Worker Runtime + Static Hosting
- CF Worker scaffold with `*.shippie.app/*` wildcard
- KV namespaces + Durable Object for version broadcast
- Serve files from R2 with Cache API + SPA fallback
- Version pointer via Postgres source of truth + KV read-through
- `__shippie/sdk.js`, `__shippie/manifest`, `__shippie/sw.js`, `__shippie/icons/*`, `__shippie/meta`, `__shippie/health`
- HTMLRewriter runtime injection fallback

### Week 3 — Deploy Pipeline (Static + Quick Ship)
- New Project form (+ deploy_mode selector)
- Zip upload → R2 staging → preflight → build (static skip) → PWA inject → upload → publish
- Preflight: slug rules, reserved paths, manifest conflict, size limits, package-age
- Build contract: detect-pm + detect-framework + AI-tool detection
- Quick Ship default; Preview as opt-in
- Deploy status page with live SSE logs
- Ship 5–10 static tools you build yourself

### Week 4 — Auth (Opaque Handle Model)
- Platform OAuth server: /oauth/authorize, /api/oauth/token, PKCE verification
- `app_sessions` with opaque handles + device tracking
- Worker: `/__shippie/auth/login`, `/auth/callback`, `/auth/logout`, `/session`
- Worker session resolution via `/api/internal/session/authorize` (signed)
- User dashboard: "Apps with access" + per-device revocation
- Cross-device sign-in via QR

### Week 5 — SDK Core + Storage
- `@shippie/sdk` package
- auth.*, db.*, analytics, feedback, install.*
- Same-origin fetch wrapper (no cross-origin tokens)
- Platform internal endpoints for SDK ops (signed, RLS session vars set)
- Quota enforcement with 429
- 3–4 stateful apps deployed (recipe, habit, workout, mood journal)
- SDK published to npm, CDN, and same-origin proxy

### Week 6 — GitHub App + Vercel Sandbox Builds
- GitHub App registration + webhook handlers
- Build flow: clone + install (detected PM) + build + extract
- Live build log streaming
- Build cache in R2
- `shippie.json` full support
- Auto-deploy on push

### Week 7 — Shippie Functions (MVP)
- Cloudflare Workers for Platforms setup + dispatch namespace
- Function bundler (esbuild) + runtime shim
- Secret storage (AES-GCM), secret injection at deploy time
- `__shippie/fn/*` routing in Worker
- Outbound allowlist enforcement via wrapped fetch
- Function logs via Tail Worker → Postgres `function_logs`
- Example apps: Stripe subscription demo, OpenAI chat demo
- Docs: functions-guide.md

### Week 8 — Auto-Packaging Layer
- Screenshot capture job (headless Chrome in Sandbox or dedicated Node job)
- Icon auto-fallback pipeline + AI-generated fallback (feature-flagged)
- Listing copy generator (AI)
- Compatibility report
- OG social card generation
- Trigger pipeline on every deploy (async, non-blocking)

### Week 9 — Trust Enforcement + Preflight v2
- Static AST walk for external fetch targets
- Runtime CSP builder per app
- ClamAV integration in Sandbox
- Permission-to-runtime enforcement in SDK endpoints
- Source provenance checks (GitHub App install + owner match)
- Privacy/support field requirements for public listings
- Domain re-scan cron job

### Week 10 — Discovery + Leaderboards + Unified Feedback
- Storefront feeds per type (app / web_app / website)
- Full-text search + fuzzy
- Ranking engine with weighted formulas + burst detection
- App detail page with trust card + QR install + install UX (Android + iOS)
- Unified feedback_items + maker inbox with dupe merging + status updates
- Public changelog on detail page

### Week 11 — Organizations + Private Distribution
- Org creation, members, invites, roles
- Audit log writes on all sensitive actions
- Apps belong to org or user (visibility_scope)
- Private-org app access check in Worker
- Org dashboard (apps, members, audit log, usage)
- Verified Business DNS check (manual approval in MVP)

### Week 12 — Launch
- Auto-generated Shippie platform PWA (install shippie.app itself)
- SEO polish, sitemap, OG cards
- Seed 15–20 apps across all three types + 2–3 function-backed apps
- Beta invites: 20 makers
- Monitoring (Sentry, uptime, backups)
- Public changelog + roadmap
- Launch post

---

## 14. Edge Cases (v3 list + v4 additions)

All 35 v3 cases stand. New v4 additions:

| # | Case | Mitigation |
|---|------|-----------|
| 36 | App needs secret for external API | **Shippie Functions** — declare in shippie.json, set via dashboard, injected at runtime |
| 37 | Function exceeds CPU/memory | 50ms CPU / 128MB memory hard limit, request returns 503 + logged |
| 38 | Function calls non-allowlisted domain | Wrapped fetch returns 403, logged, deploy flagged on dashboard |
| 39 | Function secret rotation mid-traffic | CFW4P re-deploy with new env; old Worker drains existing requests then terminates |
| 40 | Auth cookie theft via XSS | Opaque handle only; server-side lookup enforces scope + revocation; blast radius = single session |
| 41 | Session cache staleness on revoke | KV cache TTL ≤60s; immediate broadcast to Worker instances via DO |
| 42 | KV and DB diverge on version pointer | DB is source of truth; Worker falls through to platform API on cache miss |
| 43 | Quick Ship blows up from bad deploy | Instant rollback via pointer swap; auto-rollback if error rate >N% in first 10min |
| 44 | Quick Ship publishes incomplete metadata | Auto-packaging fills gaps async; missing items show "pending" in listing for ~60s |
| 45 | AI-generated icon is bad | Maker can regenerate or upload; non-blocking |
| 46 | Missing README for copy generation | Fall back to name + type; surface "add a description" hint to maker |
| 47 | Monorepo with two shippable apps | Detect `shippie.json` in subdirectories; deploy each as separate app |
| 48 | pnpm workspace protocol references | Handled by pnpm install; no-op for us |
| 49 | Bun-specific APIs in non-Bun framework | Detected and warned; build fails with clear error |
| 50 | Org member leaves — session continuity | Org membership checked on every request; next request after leave → 403 + re-auth flow |
| 51 | Private-org app accessed by non-member | Worker proxies check, returns 404 (not 403) to avoid enumeration |
| 52 | Verified Business domain expires | Re-check via cron; badge removed; org notified |
| 53 | Audit log tampering | Append-only table, no UPDATE/DELETE grants; backups + checksums |
| 54 | Malware scanner false positive | Maker can submit appeal; admin override with audit log entry |
| 55 | External domain list too restrictive, app breaks at runtime | Dashboard shows blocked fetches in real time; maker adds domain + redeploys |
| 56 | CSP breaks legitimate 3rd-party script | Declared `allowed_script_domains` in shippie.json; strict-by-default |
| 57 | Role escalation attempt | Role changes only by admins+owners; audit logged; invite tokens single-use |
| 58 | Support email spoofing | Require email verification before public listing reaches "verified" indicator |

---

## 15. Key Risks (Ranked for v4)

1. **Shippie Functions security** (HIGH) — untrusted code running on our infra. Mitigated by CFW4P V8 isolation + outbound allowlist + rate limits. Week 7 + Week 9 are spent hardening.
2. **Auto-packaging quality** (MEDIUM) — bad auto-generated icons and copy make the marketplace feel sloppy. Feature-flag AI generation; human review queue for featured apps.
3. **Quick Ship false-pass** (MEDIUM) — publishing a broken app immediately is bad UX. Auto-rollback on runtime error spike + first-launch health checks.
4. **Vercel Sandbox regional limits** (MEDIUM) — US-East only. Accept for MVP; document for EU makers.
5. **Preflight completeness** (HIGH still) — missing a check ships a hole. Treat preflight as a tested system with >50 cases (now ~58).
6. **CFW4P subscription cost** (LOW) — $25/mo flat. Worth it.
7. **Org primitives without UI** (LOW) — schema is cheap; UI ships Week 11.
8. **Opaque session lookup latency** (LOW) — KV + DO broadcast keeps hot path under 100ms; cold path is acceptable.

---

## 16. Cost Estimate (v4, MVP scale)

| Line | Cost/mo |
|------|---------|
| Vercel Pro (platform + Sandbox credits) | $20 |
| Hetzner CCX23 (Postgres only) | €15 |
| Cloudflare Workers Paid | $5 |
| **Cloudflare Workers for Platforms** (Functions) | **$25** |
| Cloudflare Advanced Certificate Manager | $10 |
| Cloudflare R2 | $0 (MVP tier) |
| Vercel Sandbox overage | $0–$12 |
| Resend | $20 |
| Sentry | $0–$26 |
| AI generation (OpenAI / image model, capped) | $0–$20 |
| Domain + misc | $5 |
| **Total** | **~$100–$160** |

---

## 17. Decisions Locked In (v4)

1. **Build runner**: Vercel Sandbox
2. **Platform hosting**: Vercel (Next.js) + Hetzner (Postgres only) via Cloudflare Tunnel
3. **GitHub**: GitHub App
4. **SDK distribution**: @shippie/sdk on npm + cdn.shippie.app + same-origin /__shippie/sdk.js
5. **Auth**: OAuth 2.0 + PKCE establishing **opaque-handle app-origin sessions**; server-side claims in `app_sessions`
6. **Version pointer**: **Postgres source of truth**, KV read-through cache, Durable Object broadcast for invalidation
7. **Deploy default**: **Quick Ship** — publish on preflight pass; Preview is opt-in
8. **Project types**: `app`, `web_app`, `website` — first-class
9. **Config**: `shippie.json` (auto-drafted if missing)
10. **Auto-packaging**: async pipeline for icon / screenshots / copy / changelog / QR / compat report; **never blocks publish**
11. **Shippie Functions**: Cloudflare Workers for Platforms; per-app secrets; outbound allowlist enforced in runtime shim
12. **Business foundations**: orgs, roles, invites, audit log, private-org distribution, verified business tier — **schema from day 1, UI Week 11**
13. **Trust**: enforced (domain scan, malware scan, CSP, permission-to-runtime) — not just presentational
14. **Feedback**: unified `feedback_items` typed system
15. **Email**: Resend
16. **Search**: Postgres FTS + pg_trgm
17. **Ranking**: hourly cron, weighted per type, burst-flagged

---

## 18. Verification Plan (additions from v3)

All 20 v3 verifications stand. New checks:

21. **Function invocation** — deploy Stripe subscription demo; call `__shippie/fn/subscribe`; verify it runs, uses env secret, returns success
22. **Function outbound allowlist** — deploy function that fetches non-allowlisted domain; verify 403 + log entry
23. **Function CPU limit** — deploy function with intentional loop; verify 503 at 50ms
24. **Quick Ship live in <60s** — upload clean static zip; verify live + listing + QR in under a minute
25. **Auto-packaging screenshot** — deploy without screenshots; verify capture job runs and populates within ~2 min
26. **AI icon fallback** — deploy without icon; verify fallback icon appears on detail page
27. **Org creation + invite flow** — create org, invite user by email, user accepts, role check enforced
28. **Private-org app access** — non-member visits subdomain → 404; member → app loads
29. **Audit log write** — publish an app; verify audit_log has entry with actor + action + target
30. **Version rollback consistency** — publish v2, rollback, verify Postgres + KV + DO broadcast all reflect the rollback within 3 seconds
31. **Opaque session revoke** — revoke session from dashboard; next SDK call returns 401 within 60s
32. **Permission-to-runtime** — call `shippie.files.upload` from app that declares `files: false` in shippie.json; verify 403 + compat report flag
33. **Trademark / reserved slug** — try slug `admin`, `apple`, `stripe`; verify blocked with clear error
34. **External domain rescan** — deploy app, later push with new fetch target; verify rescan job flags it
35. **Verified business flow** — create org, verify domain via DNS TXT, verify badge appears on all org apps
