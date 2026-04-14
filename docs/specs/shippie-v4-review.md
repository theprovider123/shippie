# Shippie v4 — Master Strategic Review

v4 is strong. The core invariant is right, auth is clean, Functions unblock the right class of apps, auto-packaging is the differentiator. But when you pressure-test it against the "shipping system" frame — especially with Ship to Stores now in scope — there are gaps. Here's the honest take.

---

## 1. Top Remaining Gaps in v4

### A. The first-time maker onboarding path is assumed, not designed
The plan assumes a logged-in maker who already has a repo. The actual first-run experience — "I heard about Shippie, I have a Bolt project, show me magic in 90 seconds" — is nowhere. This is the most important UX in the whole product and it doesn't have a week in the build plan.

### B. Error recovery contradicts "one-shot"
Quick Ship is default, but a preflight failure currently leads to a dead end. For vibe-coders, that breaks the promise. We need **one-shot with automatic remediation**: missing icon → auto-pack. Missing shippie.json → auto-draft. Missing manifest → generate. Framework unrecognized → show a 3-click override. Hard failures should be rare and always actionable.

### C. Functions is declared but the maker flow for secrets is broken
Chicken-and-egg: you can't deploy until secrets are set, but you don't know which secrets you need until you've read the repo's `functions/` directory. v4 needs an **intermediate state**: deploy continues in `needs_secrets` state, app is "installed but dormant" until secrets provided, SDK can call non-function features immediately.

### D. Store readiness is entirely absent
Never mentioned. Zero schema, zero flow, zero primitives. This is the biggest gap versus the stated positioning of "warm-up lane for the App Store."

### E. Business foundations are structural but not operational
Orgs and audit logs exist. Billing, metering, invoicing, DPA, subprocessor list, security disclosures, SOC2 path — none of it. A real business will ask for these on day one, especially for private distribution.

### F. `web_app` vs `app` is fuzzy
Both get "full runtime." Only differences are install UX aggressiveness and ranking. That's not a clear enough product distinction for makers or users. What's a SaaS dashboard? A creative tool? Where's the line?

### G. Auto-packaging pipeline doesn't feed Ship-to-Stores
Every screenshot size the auto-packager generates is for the website listing. The stores need 1024×1024 icons, 6.5"/5.5"/iPad screenshots, feature graphics, etc. We should generate **all of it in one pass** the first time, not re-build a second pipeline later.

### H. Content moderation and abuse scaling
Reports table exists but no workflow. No rate limits on feedback to prevent brigading at scale. No auto-moderation on comment content. Fine for week-1 but needs a cron-driven moderation queue.

### I. No "why didn't this ship" observability for the maker
When Quick Ship fails or degrades, makers need a single view: preflight report + build log + auto-package report + compat report + trust report + deploy artifact in one place. Today it's scattered.

### J. Ranking / discovery gaming
v4 mentions "maker actions discounted" but has no detection for sock-puppet accounts, vote rings, or self-promotion networks. For a public marketplace this bites early.

---

## 2. One-Shot Pressure Test — Does v4 Deliver?

**Static zip, clean repo**: ✅ Yes. <45s is realistic.

**GitHub connect, Vite SPA, no shippie.json**: ✅ If auto-draft + auto-package work smoothly. But the spec doesn't clearly say auto-draft happens **before** preflight, not after. That ordering matters.

**GitHub connect, repo with functions + secrets**: ⚠️ Breaks. Secrets step isn't in the one-shot flow.

**Next.js SSR repo**: ❌ Rejected. Correct, but the error message needs to offer a migration path ("Shippie Functions can handle your API routes — rewrite in 2 steps").

**Monorepo with multiple apps**: ⚠️ Partial. v4 says "prompt for root_directory" — that's not one-shot, that's a form.

**A repo with malware flagged by ClamAV**: ✅ Blocked correctly.

**A repo targeting Node 22 when sandbox defaults to 20**: ⚠️ Not addressed.

**Bolt/Lovable export with non-standard structure**: ⚠️ Detected but no presets wired. Needs real testing.

**Recommendation**: define a **"Quick Ship SLO"** — target 80% of connected GitHub repos should go live in under 3 minutes with no additional maker input. Anything below that is failure. Instrument and track this metric from day 1.

---

## 3. Maker Flow Review (End-to-End)

The flow should look like this, with every step measured:

```
1. Land on shippie.app              ← 0s
2. Sign in with GitHub              ← +15s
3. "New App" → Connect repo         ← +5s
4. Pick repo (inline search)        ← +10s
5. Auto-detection runs              ← +2s
6. Preview card: "We think this is a Vite SPA, type: app.
   Icon will be auto-generated. Ship it?"
7. [Ship]                           ← click
8. Live progress:
   Preflight ✓
   Building... ✓
   Packaging... ✓
   Publishing... ✓
   Screenshotting... (async)
9. Live: recipes.shippie.app        ← target: <2.5 min total from step 1
10. Install to phone (QR)           ← +20s
11. Sign in inside the app          ← +15s
```

**Missing from v4**:
- Inline repo search with autocomplete (not in spec)
- "Preview detection" step before commit-to-deploy (not in spec)
- Post-deploy "install now on your phone" hero state with QR immediately showing
- An explicit "first-time maker" tour

**Fix**: add Week 0 (prep) → "onboarding flow" as a first-class deliverable. Treat `shippie.app/new` as the hero surface. Measure time-to-live for every first-time deploy.

---

## 4. Three Project Types — Sharpen the Definitions

v4 leaves these too close together. Re-frame them around maker intent and user experience:

| | `app` | `web_app` | `website` |
|---|---|---|---|
| **Maker intent** | "Users should have this on their phone" | "Users will open this in a tab, maybe bookmark it" | "This is content people come to, not a product" |
| **Install UX** | Aggressive: QR, install banner, "Add to Phone" CTA on every view | Available but passive; only prompts after engagement | None |
| **Full-screen PWA** | Required, enforced by SW + manifest | Optional | No |
| **SDK features default** | auth, storage, files, notifications, feedback | auth, storage, feedback | analytics, feedback only |
| **Offline expected** | Yes, SW caches aggressively | Partial, stale-while-revalidate | No |
| **Typical size** | Tens of KB to a few MB | Few MB | Any |
| **Discovery shelf** | "Apps" (installable) | "Tools" (web) | "Sites" (browse) |
| **Ranking weight** | installs × retention | sessions × return visits | views × quality × recency |
| **Ship to Stores eligible** | Yes (primary target) | Maybe (edge cases: single-purpose web apps) | No (by default) |

**Add**: every listing shows a "best on" badge (mobile / desktop / any) so users know what they're getting.

**Add**: type can be changed post-deploy with a warning about implications.

---

## 5. Business Foundations — What's Missing

v4 has structure. It's missing operations:

| Missing | Why it matters | Phase |
|---------|---------------|-------|
| **Billing integration** (Stripe or Lemon Squeezy) | No monetization path for Pro/Team/Business plans | Launch |
| **Usage metering + overages UX** | Businesses need predictable cost, not surprises | Launch |
| **Invoices + receipts portal** | Required for any B2B sale | Launch |
| **DPA (Data Processing Addendum)** | Required by virtually every EU business customer | Launch |
| **Subprocessor list** (public page) | GDPR + trust requirement | Launch |
| **Security incident disclosure policy** | Table stakes for business sales | Launch |
| **SOC2 / ISO 27001 path** | Signaled roadmap even if not achieved | Phase 2 |
| **SSO/SAML** | Required by enterprise | Phase 2 |
| **SCIM user provisioning** | Enterprise | Phase 3 |
| **IP allowlists for private-org apps** | Enterprise network constraints | Phase 2 |
| **Data residency choice per app** | Already in `organizations.data_residency` but not enforced anywhere in the stack | Needs real impl |
| **Approved app catalog** (internal curation) | "These are the apps IT allows you to use" for large orgs | Phase 2 |
| **Role: billing_manager** separate from owner | Common enterprise split | Launch |

---

## 6. Ship to Stores — The New Core

This is the biggest strategic add. Here's how it fits into Shippie without weakening the PWA core.

### Distribution Model: The Three Ships

```
Ship to Web       → {slug}.shippie.app — always live, from day 1
Ship to Phone     → PWA install (A2HS iOS, install prompt Android)
Ship to Stores    → Store-ready artifacts + submission path
```

Every `app`-type project unlocks **all three** automatically. Ship to Stores is a second gate, not a second product.

### Native Readiness Score (0-100)

A visible, enforced score on every `app` listing. Reaches 100 only when the app is actually store-ready.

**Required for any score above 0:**
- Privacy policy URL
- Support email
- Account deletion endpoint (`__shippie/fn/_account_delete` — new reserved route)
- Age rating declared
- Category
- Bundle ID (reverse-DNS)

**Required for >50:**
- Store icon 1024×1024
- Screenshots for iOS (iPhone 6.5", 5.5", optional iPad Pro 13")
- Screenshots for Android (phone, 7" tablet, 10" tablet)
- Short description + long description + release notes
- App Store keywords + Play tags

**Required for >85 (ready to submit):**
- Sign in with Apple configured (if any OAuth provider used)
- iOS Privacy Manifest complete
- Android Data Safety form complete
- No "WebView-only rejection risk" — i.e. uses ≥1 **Shippie Native Bridge** feature
- Verified maker or verified org
- Billing address + legal entity (stores require this for payout)

**100:**
- All of the above + successful build of Capacitor wrapper + signed artifact exists in R2

### Shippie Native Bridge — The Anti-Rejection Layer

Apple's Rule 4.2 (Minimum Functionality) is the #1 rejection reason for PWA wrappers. Shippie needs to provide actual native capabilities through a feature-detecting bridge:

```typescript
// Same SDK. Falls back to Web APIs on web, uses Capacitor plugins in native wrapper.
shippie.native.haptics.impact('medium')
shippie.native.camera.takePhoto()
shippie.native.biometric.authenticate()
shippie.native.share(data)
shippie.native.notifications.scheduleLocal(...)
shippie.native.contacts.pick()
shippie.native.filesystem.writeFile(...)
shippie.native.deviceInfo()
shippie.native.appReview.request()
shippie.native.deepLink.register(...)
```

On web: progressive enhancement using Web APIs where available (Web Share API, Web Vibration, Web Push).
In Capacitor wrapper: Capacitor plugins, giving Apple the "platform-specific experience" they require.

The readiness score rewards apps that use ≥1 Native Bridge feature because that's what pushes an app past the minimum-functionality bar.

### Submission Pipeline

**Ship to Stores flow:**

```
Maker clicks "Ship to Stores" on a live app
  ↓
Readiness Gate: show score + what's missing
  ↓
(If <85) Maker fills gaps with in-app flows:
  - Privacy policy generator (from detected SDK usage)
  - Store copy AI-generator
  - Screenshot autofill from existing captures (+ manual overrides)
  - Privacy manifest generator from runtime usage
  ↓
(If 85+) Legal gate:
  - Verified maker or org required
  - Accept submission ToS
  - Provide signing credentials (iOS Apple Developer team + Android keystore) OR let Shippie create/store them
  ↓
Build Pipeline (extends v4 deploy):
  - Generate Capacitor project from PWA
  - Inject Native Bridge plugins per declared capabilities
  - Build iOS .xcarchive (on macOS runner — Vercel Sandbox Mac or partner service)
  - Build Android .aab (any linux runner, fastlane)
  - Sign both
  - Store signed artifacts in R2 under submissions/{app_id}/
  ↓
Submission:
  - Android: upload .aab via Play Console API → internal track
  - iOS: upload .xcarchive via Transporter / App Store Connect API → TestFlight
  - Show submission status on dashboard
  ↓
After maker confirms / review passes:
  - Promote to production tracks
  - Update shippie.app listing with "Now on App Store" + "On Google Play" badges
```

### iOS macOS Build Runner Reality

Vercel Sandbox does not ship a macOS runner. For the iOS build you have three paths:

1. **Partner runner** (Codemagic, Bitrise, Ionic Appflow, Expo EAS) — cleanest Phase-1 path, integrate via API, ~$0.05–$0.20/build
2. **Self-hosted MacStadium / MacMini Colocation** — expensive, high ops, only worth it at scale
3. **Require maker to run one local command** — Shippie generates the Capacitor project + Fastlane config, maker runs `shippie ios-build` locally on their Mac. Acceptable for MVP, unsatisfying long-term

**Recommendation**: Launch with Codemagic/EAS partnership for iOS builds. Shippie hosts the Android build. Document the partner relationship clearly.

### Android: Fully Automated Is Achievable

Android can be fully automated at launch:
- Bubblewrap for TWAs (Trusted Web Activity) — simplest path, works for most `app`-type projects
- OR Capacitor Android via Gradle in a Linux build runner (Vercel Sandbox can do this)
- Signing key managed by Shippie or uploaded by maker
- Upload via Play Console API to internal track
- Maker clicks "promote" when ready

**"Ship to Play Store in 10 minutes" is a realistic launch promise for Android.**

### iOS: Be Honest

Launch phase iOS = Shippie generates everything, maker opens Xcode, runs one command, submits. Phase 2 = partner runner automation. Phase 3 = direct App Store Connect integration.

Be transparent. Call it **"Shippie iOS Prep Kit"** in launch. It's still 10x better than the current DIY experience.

---

## 7. Schema Additions for v5

```sql
-- Native bundles and submissions
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
create index compliance_app_platform_idx on compliance_checks (app_id, platform);

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
```

---

## 8. `shippie.json` Additions

```jsonc
{
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
    "plugins": ["camera", "haptics", "share", "biometric"],
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
    "long_description": "...",
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
      "function": "./functions/_account_delete.ts"
    },
    "data_safety": {
      "data_collected": ["email", "app_activity"],
      "data_shared": [],
      "encrypted_in_transit": true,
      "encrypted_at_rest": true,
      "can_delete": true
    }
  }
}
```

---

## 9. Pipeline Additions

1. **Auto-detect stores readiness on every deploy** — readiness score is computed on every build, surfaced on dashboard, no separate opt-in needed. "Ship to Stores" button appears when score ≥85.
2. **Native Bundle build job** — separate async pipeline triggered on maker's "Submit" action. Uses partner runner for iOS, own runner for Android. Stores signed artifact in R2, writes `native_bundles` row.
3. **Compliance runner** — cron job per app that runs `compliance_checks` on schedule + on every deploy. Stores results, surfaces on dashboard, blocks submission if any `required` check failed.
4. **Privacy manifest generator** — static analysis of SDK calls + function outbound calls → generates iOS privacy manifest JSON + Android data safety form.
5. **Store metadata generator** — extends auto-packaging to produce store-size screenshots (iOS 6.5"/5.5", Android phone/tablet) + 1024×1024 icon + feature graphic.
6. **Submission webhook listeners** — ingest status updates from Play Console API and App Store Connect API, update `native_bundles.submission_status`, notify maker.

---

## 10. Trust / Compliance Expansions

v4's trust layer was good for web. For stores it needs:

- **Signed artifact integrity**: hash + timestamp every submission artifact. Maker + Shippie can prove what was submitted
- **Submission audit trail** on `audit_log` — every Ship to Stores action is permanent record
- **"This is my app" attestation** — before first submission, maker signs a legal attestation that they own the code, rights, and brand
- **Content review gate for `app` type** when submitting to stores — automated check against Apple/Google prohibited content categories
- **Automated Sign in with Apple enforcement** — if OAuth providers include Google and target includes iOS, SIWA is required and non-optional
- **Automated account deletion endpoint verification** — test that `__shippie/fn/_account_delete` actually wipes data (integration test run pre-submission)
- **Third-party SDK audit** — static analysis lists every third-party module in build output and functions; flags known SDKs that require privacy disclosure (analytics, ads, etc.)
- **DPA + subprocessor updates** — any time Shippie adds a subprocessor, impacted orgs are notified 30 days in advance per standard DPA terms
- **Incident response playbook** — documented, linked from security page, lives in docs/security.md

---

## 11. Recommended v5 Direction

Keep everything in v4. Add these six **new pillars**:

### Pillar 1: The Three Ships
Position every `app` as serving Web, Phone, and Stores from day one, with Shippie handling each track.

### Pillar 2: Shippie Native Bridge
A first-class SDK layer (`@shippie/native`) that feature-detects and provides native capabilities when running inside a Capacitor wrapper. This is what beats Apple's minimum-functionality rejection and separates Shippie from a static-hosting competitor.

### Pillar 3: Native Readiness Score + Enforcement Gates
Visible, enforced readiness scoring. Store submission is gated on real compliance, not self-attested badges. Generated artifacts, not maker homework.

### Pillar 4: Store Pipeline (Android Automated, iOS Prep Kit)
Android: full automation via Play Console API + Bubblewrap/Capacitor/Gradle. Launch day.
iOS: prep-kit (generate everything, maker signs locally) at launch; partner runner integration in Phase 2; direct App Store Connect API in Phase 3.

### Pillar 5: Compliance Automation
Privacy manifest generation, Data Safety form generation, account deletion endpoint as a reserved system route, Sign in with Apple enforcement, compliance checks as code.

### Pillar 6: Business Operations
Billing, metering, invoicing, DPA, subprocessor list, SOC2 roadmap, incident response. Makes Shippie credible for private-distribution-first enterprise adoption.

### Build plan becomes 14 weeks
- Weeks 1–12 of v4 stand (with onboarding flow added to Week 2, Functions secrets UI to Week 7, auto-packaging extended to store-size assets in Week 8)
- **Week 13**: Native Readiness Score + Ship to Stores UI + Android TWA pipeline
- **Week 14**: iOS Prep Kit + compliance automation + business ops (billing, DPA, subprocessor page)

---

## 12. Launch vs Later

| Capability | Launch (v5 weeks 1–14) | Phase 2 (post-launch) | Phase 3+ |
|---|---|---|---|
| Ship to Web | ✓ | | |
| Ship to Phone (PWA install) | ✓ | | |
| Native Readiness Score | ✓ | | |
| Compliance automation + privacy manifest generation | ✓ | | |
| Account deletion reserved route | ✓ | | |
| Native Bridge SDK (share, haptics, deviceInfo, deepLink) | ✓ | Camera, biometric, contacts | Full plugin ecosystem |
| Android TWA automated submission | ✓ | | |
| Android Capacitor full build | ✓ | | |
| iOS Prep Kit (generate, maker builds locally) | ✓ | | |
| iOS partner runner automation (Codemagic/EAS) | | ✓ | |
| Direct Play Console API (production track) | | ✓ | |
| Direct App Store Connect API + TestFlight | | | ✓ |
| In-app purchase / Play Billing proxy | | | ✓ |
| White-label submission for enterprise | | | ✓ |
| Internal distribution → public → stores, same codebase | ✓ | | |
| Billing, DPA, subprocessor page | ✓ | | |
| SSO / SAML | | ✓ | |
| SCIM | | | ✓ |
| SOC2 Type I | | ✓ | Type II |

---

## 13. Positioning

**Vercel** helps code go live.
**The App Store** distributes finished native apps.
**Shippie** is the shipping system that turns code into launched, installed, used, iterated-on software — and gets it store-ready along the way.

Shippie is the only place where "I built a thing last night" becomes:
1. "people have it on their phone this morning" (web + PWA)
2. "people are on Play Store this week" (Android automated)
3. "ready for App Store next month" (iOS prep kit → partner runner → direct integration)

You're not competing with Vercel (they're a backend primitive you use). You're not competing with the App Store (you're the funnel into it). You're the **shipping layer** between code and distribution — the thing neither Vercel nor the App Store provides: **end-to-end shipping, installability, feedback, iteration, and store-readiness in one flow, with one SDK, for one maker, on one codebase**.

The moat isn't hosting. It's the integrated loop:
> repo → live origin → phone install → feedback → iteration → store-ready → submitted → launched

Nobody else is doing all of that in one place, and for vibe-coded apps specifically, no one even comes close.
