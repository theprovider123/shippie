# Shippie — Implementation Plan (v5)

## Context

Shippie is the shipping system. Not a deploy platform, not a marketplace — a complete pipeline that turns code into launched, installable, iterable software. v5 adds the final strategic layer: **The Three Ships** — every `app` project serves Web, Phone, and (optionally) the App Store and Play Store from one codebase, one SDK, one dashboard.

**v5 builds on v4.** The invariant, auth, Functions, auto-packaging, business foundations, and trust enforcement from v4 all stand. v5 adds Ship to Stores, sharpens the first-time maker flow, fills operational business gaps, and productizes native-readiness.

This document is the **master spec**. Read it alongside v4 (foundations) and the v4 review (strategic analysis that produced v5).

---

## The Invariant (from v3, unchanged)

> **Every project deployed on Shippie becomes a Shippie-managed runtime on its own origin, with reserved same-origin system routes under `__shippie/*`.**

`shippie.app` is the control plane. `*.shippie.app` is the runtime plane. Cloudflare Worker owns `__shippie/*`. SDK calls are same-origin. Sessions are app-origin httpOnly cookies backed by opaque handles. Worker is the trust boundary.

---

## The Three Ships (v5 core addition)

Every `app` project serves three distribution channels from one codebase:

```
Ship to Web     → {slug}.shippie.app          (always on, from day 1)
Ship to Phone   → PWA install on Android/iOS  (always available for type=app)
Ship to Stores  → Google Play + App Store     (opt-in, gated by readiness)
```

| | Ship to Web | Ship to Phone | Ship to Stores |
|---|---|---|---|
| **Default** | On for every project | On for `app` type | Off, opt-in |
| **Runtime** | Cloudflare Worker + R2 + `__shippie/*` | Same + PWA manifest + SW install flow | Capacitor wrapper (iOS) / Capacitor or TWA (Android) |
| **SDK available** | Full | Full + web push | Full + Shippie Native Bridge |
| **Gated by** | Preflight pass | Preflight pass + PWA inject | Native Readiness Score ≥85 |
| **Distribution** | URL | QR + A2HS + install prompt | Play Console + App Store Connect |
| **Cost per app** | $0 | $0 | Play $25 one-time, Apple $99/yr (maker's account or Shippie-managed) |
| **Timeline** | Seconds to minutes | Immediate | Minutes (Android) / hours (iOS prep) |

Same shippie.app dashboard controls all three. One codebase. One version lifecycle. One feedback loop.

---

## What's New in v5

| # | Area | v5 Change |
|---|------|-----------|
| 1 | **Onboarding flow** | First-time maker path is a first-class deliverable (Week 2). `shippie.app/new` as the hero surface. Time-to-live SLO measured. |
| 2 | **One-shot with auto-remediation** | Preflight failures trigger auto-fix when possible (auto-draft shippie.json, auto-generate icon, auto-detect framework) — dead-end errors are the exception. |
| 3 | **Functions: `needs_secrets` state** | Deploy proceeds to "installed but dormant" if secrets required; non-function features work immediately. |
| 4 | **Sharpened project types** | `app` / `web_app` / `website` have distinct maker intent, SDK defaults, install UX, offline behavior, and store eligibility. |
| 5 | **The Three Ships** | Ship to Web / Phone / Stores as a unified distribution model. |
| 6 | **Shippie Native Bridge** | `@shippie/native` SDK layer: feature-detecting native capabilities (haptics, share, biometric, camera, etc.) that beat Apple Rule 4.2. |
| 7 | **Native Readiness Score** | 0–100 enforced scoring per app. ≥85 required for store submission. |
| 8 | **Ship to Stores pipeline** | Android TWA/Capacitor full automation; iOS Prep Kit at launch, partner runner Phase 2, direct ASC API Phase 3. |
| 9 | **Compliance automation** | Privacy manifest generator, Data Safety generator, account deletion reserved route, Sign in with Apple enforcement, compliance checks as code. |
| 10 | **Business operations** | Billing (Stripe), metering, invoices, DPA, subprocessor list, security disclosure page, SOC2 roadmap. |
| 11 | **Unified "why didn't this ship" view** | One page per deploy: preflight + build log + auto-package + compat + trust reports. |
| 12 | **Abuse scaling** | Sock-puppet detection, vote ring detection, comment auto-moderation, moderation queue. |
| 13 | **Auto-packaging feeds stores** | One pipeline generates web-size AND store-size assets (1024×1024 icons, 6.5"/5.5"/iPad/Android phone/tablet screenshots, feature graphics). |
| 14 | **Quick Ship SLO** | 80% of connected GitHub repos go live in <3 min with no extra maker input. Tracked from day 1. |

---

## 1. First-Time Maker Flow (New, Measured)

**Hero surface**: `shippie.app/new`

```
t=0s    Maker lands on shippie.app/new
        Hero copy: "Ship your app in 3 minutes. Install it on your phone in 3 clicks."
        Two choices: "Connect GitHub" | "Upload Files"

t=15s   Signs in with GitHub (first-time; cached thereafter)

t=30s   Inline repo picker with fuzzy search + recently-updated sort
        Or drag-and-drop zip uploader

t=35s   Auto-detection runs:
        - Framework (Vite, Next static, Astro, etc.)
        - Package manager (npm/pnpm/yarn/bun)
        - Project type (app / web_app / website) — inferred from package.json + files
        - Auto-draft shippie.json
        - Extract name + description from README
        - Find best icon candidate

t=40s   Preview card shown:
        "We found a Vite SPA we'll ship as an installable app.
         Name: Recipes
         Icon: auto-generated ✨
         Slug: recipes (available)
         Functions: none
         [Edit details]  [Ship it]"

t=42s   Maker clicks Ship it

t=50s   Live progress (SSE):
        ✓ Preflight passed
        ⚡ Building in Vercel Sandbox... 45s
        🎨 Packaging (icon, screenshots, manifest, SDK)... 10s
        📦 Publishing to R2 + KV... 3s
        ✅ Live at recipes.shippie.app
        📸 Screenshots capturing (async)... shown on detail page in ~60s

t=~2min Detail page loads with:
        - Hero with QR code for phone install
        - "Install to your phone" CTA
        - Compatibility score (auto-computed)
        - Trust card
        - First feedback slot ready

t=+20s  Maker scans QR on phone → A2HS prompt → installed

t=+15s  Signs in inside the installed app → works same-origin

TOTAL: ~3 minutes from landing to "installed on my phone, signed in."
```

### Quick Ship SLO
- **Target**: 80% of first-time GitHub deploys live in under 3 minutes with no extra maker input
- **Instrumentation**: `deploys.duration_ms` + `users.first_deploy_duration_ms`
- **Dashboard**: internal metrics at `shippie.app/admin/slo`
- **Alert**: if weekly 80th-percentile exceeds 3 minutes, the team investigates

### Auto-Remediation (v5 addition)
When preflight would fail, Shippie attempts remediation first:

| Failure | Auto-remediation |
|---------|------------------|
| Missing `shippie.json` | Auto-draft from framework + README + detected files |
| Missing icon | Generate from OG image → favicon → first square image in public → AI-generate |
| Missing `name` | Use repo name or `package.json.name` |
| Missing `description` | Extract from README first paragraph |
| Framework not detected | Fallback to static detection; if still fails, surface a 3-click override with package-manager + output-dir selectors |
| Monorepo with multiple apps | Detect `shippie.json` in subdirs; if only one valid, use it; if many, surface a one-click chooser |
| Node version mismatch | Try latest LTS in sandbox; if that fails, surface version selector |
| `__shippie/*` collision | Rename collided files with warning; if rename unsafe, block with clear error |

Dead-end errors (malware detected, reserved slug, preflight critical) are rare and always actionable with a single fix step.

---

## 2. Three Project Types (Sharpened)

| | `app` | `web_app` | `website` |
|---|---|---|---|
| **Maker intent** | "Users should have this on their phone" | "Users will open this in a tab, maybe bookmark it" | "This is content people come to, not a product" |
| **Install UX** | Aggressive: QR on every view, install banner, "Add to Phone" CTA | Passive: install available after engagement | None |
| **Full-screen PWA** | Required (SW + manifest enforced) | Optional | No |
| **SDK features default** | auth, storage, files, notifications, feedback, native | auth, storage, feedback | analytics, feedback only |
| **Offline expected** | Yes, aggressive SW caching | Partial, stale-while-revalidate | No |
| **Typical size** | <5MB | <20MB | Any |
| **Discovery shelf** | "Apps" | "Tools" | "Sites" |
| **Ranking weight** | installs × 7d retention × engagement | sessions × return visits × engagement | views × quality × recency |
| **Ship to Stores eligible** | ✅ Primary target | ⚠️ Case-by-case | ❌ No |
| **"Best on" badge** | mobile | desktop | any |

Type is inferred in preflight. Maker can change post-deploy with a warning.

---

## 3. Shippie Native Bridge

A feature-detecting SDK layer: same code runs as web, PWA, and Capacitor-wrapped native. On web, uses Web APIs. In wrapper, uses Capacitor plugins.

### Package
`@shippie/native` — installed alongside `@shippie/sdk`, or bundled together as `@shippie/sdk/native`.

### Launch APIs (Phase 1)
```typescript
import { shippie } from '@shippie/sdk'

// Always available — graceful fallback on web
await shippie.native.share({ title, text, url })              // Web Share API / native
await shippie.native.haptics.impact('medium')                 // Vibration / native
await shippie.native.deviceInfo()                             // UA heuristics / native
await shippie.native.deepLink.register('myapp://')            // URL handler / native
await shippie.native.appReview.request()                      // noop web / native prompt
await shippie.native.notifications.scheduleLocal({ ... })     // Web Notifications / native
await shippie.native.clipboard.write('text')                  // Clipboard API / native
await shippie.native.appState.onResume(cb)                    // visibilitychange / native
```

### Phase 2 APIs
```typescript
await shippie.native.camera.takePhoto()                       // getUserMedia / Capacitor Camera
await shippie.native.biometric.authenticate()                 // WebAuthn / Capacitor BiometricAuth
await shippie.native.contacts.pick()                          // contact picker API / native
await shippie.native.filesystem.writeFile(path, data)         // File System API / native
```

### Why This Matters
Apple App Store Rule 4.2 (Minimum Functionality) is the #1 rejection reason for PWA-wrappers that are "just a webview." By consuming Native Bridge APIs, a maker's app demonstrably provides a "platform-specific experience" — the exact phrase Apple uses as the approval criterion.

**The Native Readiness Score rewards apps that use ≥1 Native Bridge feature.** This is how Shippie gets apps past Apple review without rewriting them in Swift.

### Runtime Injection
- On web: SDK detects absence of `window.Capacitor` and routes each call to the Web API fallback.
- In wrapper: SDK detects Capacitor bridge and routes calls to Capacitor plugins auto-injected by the Ship to Stores build.

### Permission Integration
Native Bridge feature usage is detected via static analysis of the build output. Results flow into:
- `app_permissions` (must declare features in `shippie.json` to enable them)
- `privacy_manifests.accessed_apis` (iOS Privacy Manifest)
- `privacy_manifests.data_safety_android` (Play Data Safety)

---

## 4. Native Readiness Score (0–100)

Computed on every deploy. Visible on maker dashboard. Enforced on Ship to Stores.

### Score Bands
| Band | Status | What it means |
|------|--------|---------------|
| 0–30 | Not ready | Missing basics (privacy policy, support, icons, metadata) |
| 31–60 | In progress | Has metadata, needs store-size assets and compliance |
| 61–84 | Almost there | Has most; missing 1–3 required checks for submission |
| 85–99 | Ready to submit | Passes all required checks; optional polish items remain |
| 100 | Submit-ready | All checks passed + signed artifact built successfully |

### Required for ANY score above 0
- `support_email` set on app or org
- `privacy_policy_url` set or using Shippie's auto-generated privacy page
- `age_rating` declared (4+, 9+, 12+, 17+ for iOS; IARC equivalent for Android)
- `primary_category` set
- `bundle_id` set (reverse-DNS, unique per org)
- Account deletion endpoint enabled (maker opts into `__shippie/fn/_account_delete` system route)

### Required for >50
- Store icon 1024×1024 (auto-generated acceptable)
- iOS screenshots: 6.5" iPhone + optional 5.5" + optional iPad Pro 13"
- Android screenshots: phone + optional 7" tablet + optional 10" tablet
- `short_description` (30–80 chars) and `long_description` (up to 4000 chars)
- Keywords (iOS, max 100 chars comma-separated)
- Release notes (auto-from-changelog acceptable)

### Required for >85
- If ANY OAuth provider offered on iOS → **Sign in with Apple** enabled and working
- iOS Privacy Manifest complete (auto-generated from static analysis + manual additions)
- Android Data Safety form complete
- **No "WebView-only rejection risk"** — app uses ≥1 Shippie Native Bridge feature
- Verified maker OR verified business org
- Legal entity + billing address (required by stores for payouts)
- `__shippie/fn/_account_delete` passes integration test (automated, runs pre-submission)

### For 100
- All above + Capacitor wrapper builds cleanly + signed artifact exists in R2

### Enforcement
Store submission UI is locked until score ≥85. Each missing item links to the remediation flow.

---

## 5. Ship to Stores Pipeline

### Maker-Facing Flow
```
Maker clicks "Ship to Stores" on a live app
  ↓
Readiness Gate: current score + what's missing
  ↓
Fill gaps (all guided, most auto-generable):
  - Privacy policy: use Shippie-hosted auto-generated OR provide URL
  - Store copy: AI-generate from app description + tags (editable)
  - Screenshots: autofill from existing captures; generate store-size variants
  - Privacy Manifest: auto-generated from static analysis (editable)
  - Account deletion: enable (already built as reserved route)
  - Bundle ID: claim (reverse-DNS, unique check)
  ↓
Legal Gate (first submission only):
  - Verified maker or verified org required
  - Accept Ship to Stores ToS + "I own this code" attestation
  - Provide signing credentials OR opt in to Shippie-managed signing
  ↓
Choose target:
  [ Google Play - Internal Testing ]
  [ Google Play - Closed Testing ]
  [ Google Play - Production ]
  [ App Store - TestFlight ]
  [ App Store - Production ]
  ↓
Submit → Native Bundle build job
  ↓
Track status in dashboard:
  - draft → building → ready → submitted → in_review → approved/rejected → live
```

### Build Job (Android — full automation)
```
Native Bundle job fires
  ↓
Pull latest {slug}.shippie.app live version from R2
  ↓
Generate Capacitor or TWA project:
  - TWA for simple type=app projects (Bubblewrap → Android Studio project → .aab)
  - Capacitor for apps needing Native Bridge plugins
  ↓
Inject plugins for declared Native Bridge features
  ↓
Build .aab via Gradle in Vercel Sandbox (Linux)
  ↓
Sign with maker's keystore OR Shippie-managed keystore
  ↓
Upload to R2 + write native_bundles row
  ↓
Upload to Play Console via Play Developer API v3
  → internal/closed/alpha/beta/production track per maker choice
  ↓
Poll for Play status; update native_bundles.submission_status
  ↓
Notify maker on status change
```

### Build Job (iOS — Prep Kit Launch, Partner Phase 2, Direct Phase 3)

**Launch (Phase 1) — iOS Prep Kit:**
```
Native Bundle job fires (iOS)
  ↓
Generate Capacitor project with:
  - App metadata from shippie.json
  - Signing configuration
  - Info.plist with all required iOS fields
  - PrivacyInfo.xcprivacy from privacy_manifests table
  - Sign in with Apple capability if required
  - Native Bridge plugin integrations
  - Shippie SDK pre-bundled
  ↓
Build iOS Prep Kit bundle in R2:
  - Full Capacitor project source
  - Fastlane config for one-command build
  - README with one-line local build instructions
  - Pre-computed compliance report
  ↓
Download link emailed + shown in dashboard
  ↓
Maker runs locally:
  $ shippie ios-build --app recipes
  (wraps: cd ~/shippie/recipes-ios && fastlane ios beta)
  → .xcarchive generated
  → Uploaded to TestFlight via maker's Apple credentials
```

**Phase 2 — Partner Runner:** Codemagic or Expo EAS integration. Shippie submits build request via their API; they run the macOS build; result delivered to Shippie's R2. Same maker UX, fully automated.

**Phase 3 — Direct:** Shippie-hosted macOS build infrastructure (MacStadium or MacMini cloud) + direct App Store Connect API. Shippie submits to TestFlight or production directly from the dashboard.

### Signing Credentials

**Maker-managed:**
- Android: maker uploads keystore (.jks) + aliases; encrypted in `store_credentials`
- iOS: maker provides Apple Team ID + p8 key for App Store Connect API; encrypted
- Pros: maker owns identity; Shippie can't lock them out
- Cons: maker has to generate everything

**Shippie-managed (simpler):**
- Android: Shippie generates + holds keystore per app
- iOS: Shippie submits under its own App Developer account (white-label submission, Phase 2)
- Pros: one-click
- Cons: maker depends on Shippie for all updates; less portable

Both modes supported. Maker chooses at first submission.

---

## 6. Compliance Automation

### Privacy Manifest Generator (iOS + Android data safety)

Runs on every deploy. Static analysis pipeline extracts:
- SDK calls used (`shippie.auth.*`, `shippie.db.*`, `shippie.files.*`, `shippie.notify.*`, `shippie.track.*`, `shippie.native.*`)
- Third-party scripts in the build output (via AST walk)
- Function outbound domains from functions code
- Cookies and local storage usage patterns

Produces:
- **iOS `PrivacyInfo.xcprivacy`**:
  - `NSPrivacyCollectedDataTypes` — mapped from SDK usage (Email from auth, User Content from storage, Photos from camera, etc.)
  - `NSPrivacyAccessedAPITypes` — mapped from Native Bridge usage
  - `NSPrivacyTracking` — false by default unless analytics SDKs detected
- **Android Data Safety form**:
  - Data collected / shared
  - Purpose of collection
  - Optional vs required
  - Encrypted in transit / at rest (true by default via Shippie)
  - Data deletion request (true — account deletion endpoint enforced)

Maker reviews the auto-generated form in dashboard, edits if needed, approves for submission. Changes are tracked in `privacy_manifests` history.

### Account Deletion Reserved Route

`__shippie/fn/_account_delete` is a system-reserved function route. When maker enables `compliance.account_deletion.enabled = true` in `shippie.json`, Shippie exposes this route automatically. It handles:

1. User triggers delete from inside the app via `shippie.auth.deleteAccount()` or `/__shippie/fn/_account_delete`
2. Email confirmation sent (Resend)
3. 14-day grace period recorded in `account_deletion_requests`
4. Daily cron checks for expired grace periods → wipes all `app_data`, `app_files`, `app_sessions`, `analytics_events`, `feedback_items` for that (user, app) pair
5. Notifies user of completion

Auto-generates a privacy-compliant "Delete my data" page at `shippie.app/apps/{slug}/privacy/delete-me` that satisfies both store requirements.

### Sign in with Apple Enforcement

Rule: if `permissions.auth = true` AND any OAuth provider besides Apple is available AND `distribution.ship_to_stores.platforms` includes `ios` → Sign in with Apple is **automatically enabled** and **required**.

Shippie:
- Adds Apple as an OAuth provider in the OAuth authorization UI
- Configures the iOS Capacitor build with Sign in with Apple capability
- Generates the necessary Apple Developer config (Service ID, Key ID)
- Fails the Ship to Stores build if SIWA isn't working

### Compliance Checks as Code

Each check lives in `apps/web/lib/compliance/checks/` as a testable unit:

```typescript
// apps/web/lib/compliance/checks/ios-privacy-manifest.ts
export const iosPrivacyManifest: ComplianceCheck = {
  id: 'ios-privacy-manifest',
  platform: 'ios',
  required: true,
  async run(ctx: ComplianceContext): Promise<ComplianceResult> {
    const manifest = await getLatestPrivacyManifest(ctx.appId)
    if (!manifest) return fail('Privacy manifest not generated')
    if (!manifest.collected_data) return fail('Collected data types missing')
    return pass({ manifest_id: manifest.id })
  },
}
```

Runs on every deploy + on every Ship to Stores trigger. Results stored in `compliance_checks` table. Ship to Stores submission is gated on all `required: true` checks passing.

### Third-Party SDK Audit

Static AST walk of build output + function code extracts all imports and outbound fetch targets. Compared against:
- Known analytics SDKs (GA, Mixpanel, PostHog, etc.) → flagged for privacy disclosure
- Known ad SDKs → requires Data Safety disclosure
- Known AI SDKs → function secrets required
- Unknown → warning with domain list

Surfaces in trust card on every listing.

---

## 7. Business Operations (Launch)

### Billing Integration

**Provider**: Stripe (primary) or Lemon Squeezy (lower friction, MoR model for small teams).

**Plans:**
| Plan | Price | Who | Limits |
|------|-------|-----|--------|
| Free | $0 | Hobbyists | 3 apps, 10k function invocations/day, 100MB storage/app |
| Pro | $10/mo | Makers | 20 apps, 500k function invocations/day, 1GB storage/app, custom domains, store credentials, Ship to Stores |
| Team | $50/mo/org | Small teams | unlimited apps, 5M invocations/day, 10GB storage/app, private org apps, audit log export |
| Business | $200/mo/org | Businesses | SSO, DPA, verified business badge, white-label Ship to Stores, priority support |
| Enterprise | Custom | Large orgs | SCIM, SLA, dedicated Postgres, data residency choice, audit log retention |

**Schema:**
```sql
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
```

### Usage Metering + Overages UX
- Per-app quotas visible on maker dashboard
- Per-org aggregate usage with line-item breakdown
- Overage prices shown in advance
- Hard cap toggle (opt-in to auto-cut-off when limit reached)
- Email alerts at 80% and 100% of quota

### DPA (Data Processing Addendum)
- Standard DPA auto-generated per org (based on EU SCCs)
- Downloadable PDF from org settings
- Electronically signed on request
- Subprocessor list linked from DPA and always current

### Subprocessor List (public)
Published at `shippie.app/trust/subprocessors`:
- Cloudflare (Workers, R2, DNS, CFW4P)
- Vercel (platform host + Sandbox build runner)
- Hetzner (Postgres)
- Resend (email)
- Stripe (billing)
- OpenAI (auto-package AI generation — opt-out available for EU orgs)
- Sentry (error monitoring — opt-out available)
- GitHub (repo integration)
- Apple / Google (for Ship to Stores only)

Org admins notified 30 days before any subprocessor change.

### Security Incident Disclosure Policy
Published at `shippie.app/trust/security`. 72-hour disclosure commitment. Incident history list (redacted for confidentiality but publicly tracked).

### SOC2 / ISO 27001 Roadmap
Signaled from day 1 on trust page. Goal: Type I audit within 12 months of launch; Type II within 24 months. Tracked in a public roadmap doc.

### Data Residency
`organizations.data_residency` enforced at three levels:
- Postgres writes routed to region-appropriate database (EU default, US optional)
- R2 bucket region set at org creation
- Worker routing respects region affinity

### Billing Manager Role (new in v5)
New org role `billing_manager` — can manage subscriptions, view invoices, update payment method, but cannot modify apps or members.

---

## 8. Moderation + Abuse Scaling

### Moderation Queue
`reports` table exists in v4. v5 adds workflow:
- Cron job sweeps new reports every 5 min
- Auto-classifies via keyword + pattern matching (spam, scam, nsfw, impersonation)
- Auto-actions: shadow-ban high-confidence spam, flag ambiguous for human review
- Admin dashboard at `shippie.app/admin/moderation`

### Sock-Puppet Detection
- Signup with email from disposable provider → flagged
- Multiple accounts from same IP + same user agent → clustered
- Multiple upvotes on same app from same account cluster → excluded from ranking
- Pattern detection on content similarity (same phrases across multiple accounts)

### Vote Ring Detection
- Burst detection: if >N upvotes arrive on an app in <M seconds, require CAPTCHA for next N votes
- Cross-correlation: if the same set of users upvotes the same set of apps repeatedly, flag for review
- Excluded from `leaderboard_snapshots` ranking computation

### Comment Auto-Moderation
- Perspective API or self-hosted equivalent for toxicity scoring
- Auto-hide above threshold (maker can unhide)
- Repeated offenders auto-muted

### Rate Limits on Feedback
- Per user per app: 10 comments/hour, 3 bug reports/hour, 5 feature requests/hour
- Per IP: 50 anonymous actions/hour (feedback submission, upvotes)
- Enforced in Worker before proxying to platform

---

## 9. Unified Deploy Report

Replaces scattered views with one page per deploy at `shippie.app/apps/{slug}/deploys/{version}`:

```
Version: v42
Deployed: 2026-04-14 14:23 UTC
Status: Live (Quick Ship)
Duration: 2m 14s

PREFLIGHT              ✓ Passed (0 errors, 2 warnings)
  → 2 warnings about package age in lockfile (non-blocking)

BUILD                  ✓ Success (1m 45s)
  → pnpm install + pnpm build (Vite detected)
  → Output: dist/ (1.2 MB, 34 files)
  → Full log ⤵

AUTO-PACKAGE           ✓ Partial (icon auto-generated; screenshots capturing async)
  → Icon: AI-generated (theme #f97316)
  → Listing copy: from README
  → Compat report: 85/100

COMPLIANCE             ⚠ Warnings
  → Privacy policy: auto-generated (using Shippie default)
  → Account deletion: not enabled
  → ✗ iOS SIWA not configured (required if Google sign-in enabled)

TRUST                  ✓ Passed
  → Source: GitHub verified (recipes-app/main@a8f1c)
  → External domains: 0 unauthorized
  → Malware scan: clean
  → CSP: strict

NATIVE READINESS       67/100
  → [View what's needed to reach 85 →]

LIVE URL               https://recipes.shippie.app
LISTING                https://shippie.app/apps/recipes

[Roll back to v41]  [Rebuild]  [Ship to Stores]
```

---

## 10. Shippie Functions — `needs_secrets` State

v4 chicken-and-egg fix:
- Deploy pipeline reads `functions/` + `shippie.json.functions.env`
- If any `required: true` secrets missing at deploy time, deploy completes in `needs_secrets` state
- App is live at `{slug}.shippie.app` but function routes return 503 with a clear "app needs configuration" message
- SDK features not dependent on functions work immediately (auth, storage, files, feedback)
- Maker sets secrets via dashboard → Shippie auto-redeploys functions (no full rebuild) → app transitions to `live`

States:
```
draft → building → needs_secrets → live
                      ↓
                   failed → rolled_back → takedown
```

Schema change:
```sql
alter table apps
  add column deploy_status text default 'draft'
    check (deploy_status in ('draft','building','needs_secrets','live','failed','rolled_back','takedown'));
```

---

## 11. `shippie.json` v5 (Full)

```jsonc
{
  "$schema": "https://shippie.app/schema/shippie.json",
  "version": 1,
  "slug": "recipes",
  "type": "app",
  "name": "Recipes",
  "tagline": "Save, organize, search your recipes",
  "description": "A simple recipe manager for your phone.",
  "category": "food_and_drink",
  "icon": "./public/icon.png",
  "theme_color": "#f97316",
  "background_color": "#ffffff",

  "framework": "vite",
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
    "conflict_policy": "shippie",
    "screenshots": ["./public/screen-1.png"]
  },

  "sdk": {
    "version": "1.x",
    "auto_inject": true
  },

  "permissions": {
    "auth": true,
    "storage": "rw",
    "files": true,
    "notifications": false,
    "analytics": true,
    "external_network": false,
    "native_bridge": ["share", "haptics", "deviceInfo"]
  },

  "allowed_connect_domains": [],

  "functions": {
    "enabled": false,
    "directory": "functions",
    "runtime": "workers",
    "env": {}
  },

  "listing": {
    "visibility": "public",
    "featured_candidate": true,
    "require_consent_screen": false
  },

  "feedback": {
    "enabled": true,
    "types": ["comment", "bug", "request", "rating"]
  },

  "deploy_mode": "quick_ship",
  "auto_publish_on": ["main"],

  // v5 additions

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
    "wrapper": "capacitor",
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
    "long_description": "A simple recipe manager you can install on your phone. Save, organize, and search recipes; share collections with friends; works offline.",
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
    "account_deletion": {
      "enabled": true,
      "flow": "self_service",
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

## 12. Schema Additions (v5)

All v4 schema stands. v5 adds:

```sql
-- Billing + subscriptions
create table subscriptions (...);         -- as in §7
create table usage_events (...) partition by range (created_at);
create table invoices (...);

-- Ship to Stores
create table native_bundles (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  wrapper text not null check (wrapper in ('capacitor','twa')),
  version text not null,
  build_number int not null,
  bundle_id text not null,
  signed_artifact_r2_key text,
  readiness_score int,
  readiness_report jsonb,
  native_bridge_features text[],
  submission_status text default 'draft'
    check (submission_status in ('draft','building','ready','submitted','in_review','approved','rejected','live','removed')),
  rejection_reason text,
  store_connect_id text,
  play_console_id text,
  testflight_group text,
  play_track text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table compliance_checks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios','android','both','web')),
  check_type text not null,
  status text not null check (status in ('passed','failed','pending','not_applicable')),
  evidence jsonb,
  checked_at timestamptz default now()
);

create table store_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  credential_type text not null,
  encrypted_value text not null,
  metadata jsonb,
  created_at timestamptz default now(),
  rotated_at timestamptz
);

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

-- Abuse / moderation
create table moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,               -- app | comment | feedback | user
  target_id uuid not null,
  report_id uuid references reports(id),
  classification text,                     -- spam | scam | nsfw | impersonation | other
  confidence float,
  status text default 'pending',           -- pending | reviewing | actioned | dismissed
  assigned_to uuid references users(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table account_clusters (
  id uuid primary key default gen_random_uuid(),
  fingerprint_hash text unique not null,
  member_count int default 1,
  flagged boolean default false,
  created_at timestamptz default now()
);

-- First-deploy instrumentation
alter table users
  add column first_deploy_at timestamptz,
  add column first_deploy_duration_ms int,
  add column first_deploy_app_id uuid references apps(id);

-- Apps additions
alter table apps
  add column native_readiness_score int default 0,
  add column compatibility_score int default 0,
  add column native_readiness_report jsonb,
  add column best_on text check (best_on in ('mobile','desktop','any')),
  add column quick_ship_slo_hit boolean;

-- Billing manager role
alter table organization_members
  drop constraint organization_members_role_check;
alter table organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','developer','viewer','billing_manager'));
```

---

## 13. Reserved Route Additions

```
__shippie/fn/_account_delete     POST — reserved account deletion endpoint
__shippie/fn/_health             GET  — functions runtime health
__shippie/install/phone          GET  — redirect / QR handoff
__shippie/install/store          GET  — redirect to App Store / Play Store deep link when available
```

---

## 14. Project Structure Additions

```
apps/web/
├── app/
│   ├── new/                              # NEW: first-time hero surface
│   │   └── page.tsx
│   ├── (dashboard)/
│   │   ├── apps/[slug]/
│   │   │   ├── stores/                   # NEW: Ship to Stores UI
│   │   │   │   ├── page.tsx
│   │   │   │   ├── readiness/
│   │   │   │   ├── ios/
│   │   │   │   └── android/
│   │   │   ├── compliance/               # NEW
│   │   │   ├── analytics/
│   │   │   ├── feedback/
│   │   │   └── deploys/[version]/        # NEW: unified deploy report
│   │   ├── billing/                      # NEW
│   │   └── orgs/[slug]/
│   │       ├── billing/                  # NEW: subscription + invoices
│   │       └── audit-log/
│   ├── admin/
│   │   ├── moderation/                   # NEW
│   │   └── slo/                          # NEW: SLO dashboard
│   ├── trust/                            # NEW: public trust surfaces
│   │   ├── subprocessors/
│   │   ├── security/
│   │   ├── dpa/
│   │   └── compliance/
│   └── api/
│       ├── stores/                       # NEW: Ship to Stores orchestration
│       ├── billing/                      # NEW: Stripe webhook
│       ├── compliance/                   # NEW: compliance check runners
│       └── internal/
│           └── native-bundle/            # NEW: build job orchestration

lib/
├── stores/                               # NEW
│   ├── capacitor-project.ts              # generate Capacitor project from PWA
│   ├── twa-project.ts                    # Bubblewrap wrapper
│   ├── ios-prep-kit.ts                   # Phase 1 iOS path
│   ├── android-build.ts                  # Gradle build
│   ├── play-console.ts                   # Play Console API client
│   ├── app-store-connect.ts              # ASC API client (Phase 3)
│   └── signing.ts                        # credential management
├── compliance/                           # NEW
│   ├── checks/                           # individual compliance checks
│   ├── privacy-manifest.ts               # iOS manifest generator
│   ├── data-safety.ts                    # Android Data Safety generator
│   ├── siwa-enforcement.ts               # Sign in with Apple enforcer
│   └── runner.ts
├── billing/                              # NEW
│   ├── stripe.ts
│   ├── metering.ts
│   ├── invoices.ts
│   └── plans.ts
├── moderation/                           # NEW
│   ├── auto-classify.ts
│   ├── sock-puppet.ts
│   ├── vote-ring.ts
│   └── queue.ts
├── onboarding/                           # NEW
│   ├── detect.ts                         # detection pipeline
│   ├── preview-card.ts                   # "We think this is..."
│   └── slo.ts                            # first-deploy instrumentation
└── quick-ship/                           # NEW: auto-remediation
    ├── auto-draft-config.ts
    ├── auto-generate-icon.ts
    └── auto-detect-framework.ts

packages/
├── sdk/
│   └── src/
│       └── native/                       # NEW: @shippie/sdk/native
│           ├── index.ts
│           ├── share.ts
│           ├── haptics.ts
│           ├── device-info.ts
│           ├── notifications.ts
│           ├── deep-link.ts
│           ├── app-review.ts
│           └── detect.ts                 # Capacitor presence detection
├── native-bridge/                        # NEW: Capacitor plugin shims
│   └── src/
│       └── plugins/

services/
└── worker/
    └── src/router/
        └── install.ts                    # NEW: /__shippie/install/*
```

---

## 15. 14-Week Build Plan

### Week 1 — Foundation
As in v4: monorepo, Vercel, Hetzner Postgres + PgBouncer + CF Tunnel, initial migrations including v5 billing/stores/compliance tables, Auth.js, reserved_slugs seed.

### Week 2 — Worker Runtime + Onboarding Flow (NEW)
v4 Week 2 content + new first-time maker onboarding flow:
- `shippie.app/new` hero surface with repo picker
- Inline GitHub repo autocomplete
- Auto-detection pipeline (framework, PM, type, icon)
- Preview card UX before commit
- First-deploy instrumentation (users.first_deploy_*)
- SLO dashboard stub

### Week 3 — Deploy Pipeline (Static + Quick Ship + Auto-Remediation)
v4 Week 3 + auto-remediation in preflight:
- `lib/quick-ship/*` auto-draft, auto-icon, auto-detect
- Preflight failure → attempt auto-fix → retry
- Dead-end errors only on malware/reserved/critical
- Ship 5–10 static tools

### Week 4 — Auth (Opaque Handle Model)
v4 Week 4 unchanged.

### Week 5 — SDK Core + Storage
v4 Week 5 unchanged. Publish `@shippie/sdk` to npm + CDN + same-origin proxy.

### Week 6 — GitHub App + Builds
v4 Week 6 unchanged.

### Week 7 — Shippie Functions (MVP) + `needs_secrets` State
v4 Week 7 + `needs_secrets` deploy state + in-dashboard secrets UI + function auto-redeploy on secret change.

### Week 8 — Auto-Packaging (Web + Store-Size Assets)
v4 Week 8 extended:
- Generate web-size AND store-size assets in one pipeline
- iOS screenshot sizes: 6.5", 5.5", iPad Pro 13"
- Android screenshot sizes: phone, 7" tablet, 10" tablet
- 1024×1024 icon variant
- Feature graphic (Android)
- OG social card
- AI-generated copy variants (short + long description)

### Week 9 — Trust Enforcement + Compliance Runner
v4 Week 9 + compliance checks as code framework:
- `lib/compliance/checks/*` runner
- Privacy Manifest generator (static analysis)
- Data Safety generator
- Account deletion reserved route (`__shippie/fn/_account_delete`)
- Sign in with Apple enforcement logic

### Week 10 — Discovery + Feedback + Moderation
v4 Week 10 + moderation queue + abuse detection:
- Moderation queue UI at `admin/moderation`
- Sock-puppet clustering
- Vote ring detection
- Comment auto-mod
- Rate limits on feedback

### Week 11 — Orgs + Business Operations
v4 Week 11 + business ops (launch-grade):
- Stripe integration + subscriptions table + webhook
- Plans + checkout flow
- Invoices portal
- DPA auto-generation
- Subprocessor page at `shippie.app/trust/subprocessors`
- Security incident policy page
- Billing manager role
- Usage metering + overage UX

### Week 12 — Shippie Native Bridge + Launch Polish
- `@shippie/sdk/native` package with Phase 1 APIs (share, haptics, deviceInfo, deepLink, appReview, notifications, clipboard, appState)
- Web fallbacks + Capacitor detection
- Unified deploy report page
- Public trust surfaces live
- Seed apps across all three types

### Week 13 — Ship to Stores (Android Automation + iOS Prep Kit)
- Native Readiness Score computation + dashboard
- Store-readiness gate UI
- Android pipeline:
  - Capacitor project generation
  - Bubblewrap for TWA path
  - Gradle build in Vercel Sandbox
  - Play Console API integration
  - Internal track submission live
- iOS Prep Kit:
  - Capacitor project generation with full iOS config
  - Privacy manifest injection
  - Fastlane config generation
  - Maker download + one-line local command docs

### Week 14 — Launch
- Final polish, SEO, OG cards
- Ship Shippie itself as a PWA (`shippie.app` installable)
- Seed 20–30 apps across types + 3–5 with Ship to Stores active
- Beta invites: 30 makers from vibe-coding communities
- Monitoring (Sentry, uptime, backups)
- Public changelog + roadmap
- Launch post

---

## 16. Launch vs Later

| Capability | Launch (v5 weeks 1–14) | Phase 2 | Phase 3+ |
|---|---|---|---|
| Ship to Web | ✓ | | |
| Ship to Phone | ✓ | | |
| Native Readiness Score | ✓ | | |
| Compliance automation | ✓ | | |
| Account deletion reserved route | ✓ | | |
| Native Bridge SDK (Phase 1 APIs) | ✓ | Phase 2 APIs (camera, biometric, contacts, fs) | Full plugin ecosystem |
| Android TWA automated submission | ✓ | | |
| Android Capacitor full build | ✓ | | |
| Android Play Console API (internal track) | ✓ | Production track | |
| iOS Prep Kit (Capacitor project + local build) | ✓ | | |
| iOS partner runner (Codemagic/EAS) | | ✓ | |
| iOS direct App Store Connect API + TestFlight | | | ✓ |
| IAP / Play Billing proxy | | | ✓ |
| White-label submission (Shippie Dev Account) | | | ✓ |
| Internal → Public → Stores path | ✓ | | |
| Stripe billing + invoices | ✓ | | |
| DPA + subprocessor page | ✓ | | |
| Security incident page | ✓ | | |
| SOC2 Type I | | ✓ | Type II |
| SSO / SAML | | ✓ | |
| SCIM | | | ✓ |
| IP allowlists for private-org apps | | ✓ | |
| Approved app catalog (org-curated) | | ✓ | |
| Data residency enforcement | ✓ | | |
| Moderation queue + auto-classify | ✓ | Human review ops | |

---

## 17. Key Risks Ranked (v5)

1. **iOS store approval failures** (HIGH) — first app rejected by Apple is bad PR. Mitigation: Native Bridge + Native Readiness Score + explicit "use ≥1 native feature" requirement.
2. **Compliance automation false positives** (HIGH) — bad privacy manifest gets an app rejected. Every check has integration tests; manual override always available.
3. **Quick Ship SLO miss** (MEDIUM) — if time-to-live is slow, makers don't come back. Instrument from day 1, alert on weekly regression.
4. **Shippie Functions sandbox escape** (MEDIUM) — CFW4P isolation is strong but not perfect. Defense in depth with outbound allowlist + static analysis + limits.
5. **Store credentials handling** (MEDIUM) — leaking an Apple key or Android keystore is catastrophic. Encrypted at rest, HSM-backed in Phase 2.
6. **Moderation at scale** (MEDIUM) — auto-mod false positives kill legitimate feedback. Human review queue + appeals process.
7. **Cold start of marketplace** (MEDIUM) — 20+ seed apps + targeted recruiting from vibe-coding communities.
8. **Billing complexity / plan confusion** (LOW) — clear pricing page, one-sentence value per tier.
9. **SOC2 pressure from early business customers** (LOW) — roadmap signaled, Type I goal in first year.

---

## 18. Cost Estimate (v5, MVP Scale)

| Line | Cost/mo |
|------|---------|
| Vercel Pro (platform + Sandbox credits) | $20 |
| Hetzner CCX23 (Postgres only) | €15 |
| Cloudflare Workers Paid | $5 |
| Cloudflare Workers for Platforms (Functions) | $25 |
| Cloudflare Advanced Certificate Manager | $10 |
| Cloudflare R2 | $0 |
| Vercel Sandbox overage | $0–$12 |
| Resend | $20 |
| Sentry | $0–$26 |
| AI generation (OpenAI / image model, capped) | $10–$30 |
| Stripe fees (0%, per-tx) | — |
| Codemagic / EAS iOS partner runner (Phase 2, not launch) | — |
| Domain + misc | $5 |
| **Total at launch** | **~$110–$175** |

---

## 19. Positioning

**Vercel** helps code go live.
**The App Store** distributes finished native apps.
**Shippie** is the shipping system that turns code into launched, installed, used, iterated-on software — and gets it store-ready along the way.

Shippie is the only place where "I built a thing last night" becomes:
1. **This morning**: people have it on their phone (web + PWA install)
2. **This week**: it's on Google Play (Android automated)
3. **This month**: it's ready for App Store submission (iOS Prep Kit → partner runner → direct integration)

You're not competing with Vercel — they're a backend primitive you use.
You're not competing with the App Store — you're the funnel into it.
You're the **shipping layer** between code and distribution.

The moat is the integrated loop, end-to-end, for vibe-coded apps:
> repo → live origin → phone install → feedback → iteration → store-ready → submitted → launched

One codebase. One SDK. One dashboard. Three Ships.

---

## 20. Decisions Locked In (v5)

Everything from v4 still stands plus:

18. **The Three Ships** — Ship to Web (all projects), Ship to Phone (app type default), Ship to Stores (opt-in, gated by Native Readiness Score ≥85)
19. **Shippie Native Bridge** — `@shippie/sdk/native` with Phase 1 APIs at launch
20. **Native Readiness Score** — enforced, visible, gate for store submission
21. **iOS Prep Kit at launch**, partner runner Phase 2, direct ASC Phase 3
22. **Android full automation at launch** via Play Console API + Capacitor/Bubblewrap
23. **Compliance checks as code** — privacy manifest generator, Data Safety generator, SIWA enforcement, account deletion reserved route
24. **Business ops at launch** — Stripe billing, invoices, DPA, subprocessor page, security incident policy
25. **`billing_manager` role** in organization_members
26. **Quick Ship SLO** — 80% of first-time deploys live in <3 minutes, measured and alerted
27. **Auto-remediation before preflight block** — preflight tries to auto-fix before failing
28. **`needs_secrets` deploy state** — Functions deploys can proceed without all secrets; app runs with non-function features
29. **Moderation queue + abuse detection** — sock-puppet clustering, vote ring detection, comment auto-mod at launch
30. **Unified deploy report** — one page per deploy with preflight, build, auto-pack, compliance, trust, and native readiness in one place
