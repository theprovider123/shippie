# Shippie v5.1 — Patch List

Surgical fixes to v5 based on Codex review (2026-04-14). This document is a **patch list**, not a replacement. Apply each patch against `shippie-implementation-plan-v5.md`. Nothing outside these patches changes.

All five review findings are accepted as valid:
- **P1-A**: store_credentials doesn't support user-scoped Pro makers
- **P1-B**: iOS UI overclaims vs. actual launch capability
- **P2-A**: `__shippie/*` auto-rename will orphan imports; should hard-block
- **P2-B**: `needs_secrets` needs to live on `deploys.status`, not `apps.deploy_status`
- **P2-C**: Native Readiness ladder requires account deletion too aggressively; should be conditional on data retention

---

## Patch 1 — `store_credentials` supports both users and organizations

**Problem**: Pro plan ($10/mo) is user-scoped and explicitly includes Ship to Stores + store credentials, but `store_credentials` schema only has `organization_id`. Solo makers on Pro cannot store Android/iOS signing credentials. Forcing every paid user into an org is undocumented and contradicts the pricing page.

### Schema fix (§12, replace existing `store_credentials`)

```sql
create table store_credentials (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'organization')),
  subject_id uuid not null,
  platform text not null check (platform in ('ios', 'android')),
  credential_type text not null,
  encrypted_value text not null,           -- AES-GCM
  metadata jsonb,
  created_at timestamptz default now(),
  rotated_at timestamptz
);

create index store_credentials_subject_idx
  on store_credentials (subject_type, subject_id, platform);
```

Matches the polymorphic `subject_type` / `subject_id` pattern already used by `subscriptions` in §7. Consistent and symmetric.

### Access-control rule

Looking up credentials for an app:
1. If `apps.organization_id` is set → resolve against `('organization', apps.organization_id)`
2. Else → resolve against `('user', apps.maker_id)`

Add to `lib/stores/signing.ts` as a single helper:
```typescript
export async function getStoreCredentialsFor(app: App, platform: 'ios'|'android') {
  const subject = app.organization_id
    ? { type: 'organization', id: app.organization_id }
    : { type: 'user',         id: app.maker_id }
  return db.query.storeCredentials.findMany({
    where: and(
      eq(storeCredentials.subjectType, subject.type),
      eq(storeCredentials.subjectId,   subject.id),
      eq(storeCredentials.platform,    platform),
    )
  })
}
```

### RLS policies
Store credentials only readable/writable by:
- The user themselves (if `subject_type = 'user'` and `user_id = current_user`)
- Org members with role `owner`, `admin`, or `billing_manager` (if `subject_type = 'organization'`)

### Apps ownership
`apps.maker_id` always points to a user (unchanged). `apps.organization_id` is nullable (unchanged). The ownership resolution helper above is the single source of truth.

### Docs addition
Add to §7 Business Operations, under Plans table:
> "Pro is a user-scoped plan. Pro makers get their own `store_credentials` entries under `subject_type='user'` — no org required. Team and Business plans store credentials under `subject_type='organization'`. An app owned by an org always resolves credentials against that org, never against its individual maker."

---

## Patch 2 — Honest iOS UX at launch

**Problem**: §5 Maker-Facing Flow offers "App Store - Production" and hints at Shippie-managed signing as immediate choices. §15 Week 13 delivers only an iOS Prep Kit. §16 Launch vs Later correctly shows Production-track iOS and direct ASC API as Phase 2/3. The UI and the implementation contradict.

### §5 Ship to Stores flow — replace the target selector

**Old**:
```
Choose target:
  [ Google Play - Internal Testing ]
  [ Google Play - Closed Testing ]
  [ Google Play - Production ]
  [ App Store - TestFlight ]
  [ App Store - Production ]
```

**New**:
```
Choose target:

  ANDROID  (fully automated at launch)
  [ Play Console — Internal Testing ]
  [ Play Console — Closed Testing (Alpha/Beta) ]
  [ Play Console — Production ]

  iOS  (Prep Kit at launch — manual local build step required)
  [ App Store Connect — TestFlight (via iOS Prep Kit) ]
  [ App Store Connect — Production            Phase 2 ]  ← disabled, "Coming soon"
```

And below the selector:
> **iOS at launch**: Shippie generates a complete, signed-ready Capacitor project + Fastlane config. You run one command on a Mac to build and upload to TestFlight. Promotion from TestFlight to Production is done by you in App Store Connect. Direct Shippie → App Store Connect submission is in Phase 2.

Shippie-managed signing as a choice is **hidden at launch** for iOS. It shows as a disabled "Phase 3" row in the credentials selector with a "Notify me" action.

### §5 — Signing credentials section, replace:

**Old**:
```
- Provide signing credentials (iOS Apple Developer team + Android keystore)
  OR let Shippie create/store them
```

**New**:
```
Android:
  • Maker-managed: upload .jks + aliases; encrypted in store_credentials
  • Shippie-managed: Shippie generates and holds the keystore per app
  Both available at launch.

iOS (launch):
  • Maker-managed only. Provide Apple Team ID + App Store Connect API key
    for TestFlight uploads.
  • Shippie-managed iOS signing is Phase 3 — requires direct ASC API access
    and is only available once Shippie holds an Apple Enterprise / Developer
    account relationship. Announced separately.
```

### §15 Week 13 deliverables — updated iOS scope

Replace the iOS Prep Kit bullets with:

```
- iOS Prep Kit (launch scope):
  - Capacitor project generation with full iOS config
  - Info.plist + PrivacyInfo.xcprivacy + SIWA capability
  - Shippie SDK + Native Bridge pre-bundled
  - Fastlane config for one-command TestFlight upload
  - Maker downloads the prep kit from dashboard
  - Maker runs `shippie ios-build` locally on a Mac
  - TestFlight upload uses maker's own Apple credentials
- iOS UI clearly labels Production track as "Phase 2 — coming soon"
- iOS Prep Kit verification page shows what's included and what the maker must do
```

### §16 Launch vs Later — tighten iOS rows (no content change, just emphasis)

Already correct in v5. The problem was that §5 and §15 overpromised beyond what §16 allowed. After Patch 2, all three agree.

### §20 Decisions — replace decision 21

**Old**:
> 21. iOS Prep Kit at launch, partner runner Phase 2, direct ASC Phase 3

**New**:
> 21. **iOS at launch = TestFlight via iOS Prep Kit only**. Partner runner (Codemagic / EAS) in Phase 2 enables automated builds. Direct App Store Connect API with TestFlight + Production track in Phase 3. Shippie-managed iOS signing is Phase 3. The launch UI does not present any iOS path the backend cannot fulfill.

---

## Patch 3 — `__shippie/*` collision is a hard block

**Problem**: v5 §1 auto-remediation table says "Rename collided files with warning; if rename unsafe, block with clear error." In practice, by the time preflight sees the build output, bundlers (Vite, Next, Astro, webpack) have already baked file paths into import graphs, asset URLs, and sourcemaps. Renaming a file silently breaks every reference to it. This will ship broken apps.

### §1 Auto-Remediation table — replace the `__shippie/*` collision row

**Old**:
```
| `__shippie/*` collision | Rename collided files with warning;
                             if rename unsafe, block with clear error |
```

**New**:
```
| `__shippie/*` collision | Hard block. Error message names the colliding
                             files and shows how to rename them in source.
                             Exception: a narrow allowlist of top-level
                             maker files Shippie fully controls
                             (manifest.json, sw.js) — handled by the
                             existing conflict_policy (shippie | merge | own),
                             never by silent rewrite. |
```

### §9 Reserved Route Contract — add note

Append to the reserved routes block:
> **Collision policy**: any build output under `__shippie/*` is a **hard preflight block**. Auto-remediation never rewrites built assets. The only exception is top-level `manifest.json` / `sw.js` (handled by `pwa.conflict_policy`). Makers who produce reserved paths must move or rename them in source before Shippie will build.

### §17 Key Risks — downgrade auto-rename risk, add build correctness risk

Remove mention of "silent rewriting" and add:
> **Build correctness after auto-remediation** (MEDIUM) — auto-remediation is limited to generating missing files (icon, manifest, shippie.json) and inspecting metadata. It never rewrites build output. This keeps Quick Ship useful without silently breaking bundler import graphs.

---

## Patch 4 — `needs_secrets` lives on `deploys.status`, not `apps.deploy_status`

**Problem**: v5 §10 added `needs_secrets` only to `apps.deploy_status`. The rest of the system is versioned per deploy (§9 unified deploy report, v3 `deploys.status`). That makes a secrets-blocked version impossible to represent in deploy history, retry independently, or diff against prior versions.

### Schema fix

**Remove** from v5 §12:
```sql
alter table apps
  add column deploy_status text default 'draft'
    check (deploy_status in ('draft','building','needs_secrets','live','failed','rolled_back','takedown'));
```

**Replace with**:
```sql
-- Deploy-level status is the source of truth for any version's lifecycle.
-- App-level status is a denormalized cache of the latest *live* deploy.

alter table deploys
  drop constraint deploys_status_check;

alter table deploys
  add constraint deploys_status_check
  check (status in ('building','needs_secrets','success','failed'));

-- Apps cache the latest live + any preview/needs_secrets pointer
alter table apps
  drop column if exists deploy_status;

alter table apps
  add column latest_deploy_id     uuid references deploys(id),
  add column latest_deploy_status text,          -- mirrors deploys.status for fast feeds
  add column active_deploy_id     uuid references deploys(id),  -- what's serving on {slug}.shippie.app
  add column preview_deploy_id    uuid references deploys(id);

-- Trigger: keep apps.latest_deploy_* in sync with newest deploys row
create or replace function sync_app_latest_deploy() returns trigger as $$
begin
  update apps
     set latest_deploy_id     = NEW.id,
         latest_deploy_status = NEW.status,
         updated_at           = now()
   where id = NEW.app_id
     and (latest_deploy_id is null
          or (select version from deploys where id = latest_deploy_id) < NEW.version);
  return NEW;
end $$ language plpgsql;

create trigger deploys_sync_app_latest
  after insert or update of status on deploys
  for each row execute function sync_app_latest_deploy();
```

### Retry semantics

When maker sets a missing secret on a `needs_secrets` deploy:
1. The **same deploys row** is updated (status → `building`), not a new row
2. Only the Functions dispatch step re-runs; the static build output is already in R2
3. On success, status → `success` and `apps.active_deploy_id` is updated (if this was a Quick Ship)
4. Unified deploy report reflects the transition inline

This keeps deploy history clean and makes retries cheap.

### §10 Shippie Functions section — update the states diagram

**Old**:
```
draft → building → needs_secrets → live
                      ↓
                   failed → rolled_back → takedown
```

**New**:
```
Deploy status:      building → needs_secrets → success
                        ↓            ↓
                     failed      (resume with secrets)

App overall status (derived from latest + active deploys):
draft → has_live_version → takedown
```

Note: there is no longer a separate `rolled_back` state. Rollback is "active_deploy_id points to an older deploys row." The old row still has `status = success`.

### §9 Unified Deploy Report

Add a new row to the report:
```
FUNCTIONS              ⚠ needs_secrets
  → Required secrets missing: STRIPE_KEY, OPENAI_KEY
  → Functions are dispatched but will return 503 until configured
  → [Set secrets] → auto-resumes this deploy
  → Non-function features (auth, storage) work normally
```

### §20 Decisions — update decision 28

**Old**:
> 28. `needs_secrets` deploy state — Functions deploys can proceed without all secrets; app runs with non-function features

**New**:
> 28. **`needs_secrets` is a deploys.status value**, not an apps field. The deploy row is re-used when the maker provides secrets (status → building → success). App-level status is derived from `active_deploy_id` and `latest_deploy_id`. Non-function features work at the `{slug}.shippie.app` origin while functions return 503 with a clear message.

---

## Patch 5 — Account deletion required only when apps retain user data

**Problem**: v5 §4 makes account deletion a hard prerequisite for any Native Readiness Score above 0. Apple and Google both tie deletion requirements to **account creation / retained personal data**, not to every app category. A stateless currency converter does not need a deletion endpoint to pass review. Requiring it creates arbitrary friction and makes the score feel bureaucratic.

### §4 Native Readiness Score — replace Required-for-any-score-above-0 list

**Old**:
```
Required for ANY score above 0:
- support_email set on app or org
- privacy_policy_url set or using Shippie's auto-generated privacy page
- age_rating declared
- primary_category set
- bundle_id set (reverse-DNS, unique per org)
- Account deletion endpoint enabled
```

**New**:
```
Required for ANY score above 0 (every app):
- support_email set on app or org
- privacy_policy_url set (or using Shippie's auto-generated default)
- age_rating declared
- primary_category set
- bundle_id set (reverse-DNS, unique per subject)

Conditionally required — triggered automatically when the app retains user data:
- Account deletion endpoint enabled — REQUIRED IF ANY OF:
    - shippie.json.permissions.auth == true
    - shippie.json.permissions.storage != "none"
    - shippie.json.permissions.files == true
    - analytics events contain user_id (non-anonymous)
  Otherwise: marked `not_applicable` in compliance_checks and does not affect the score.
```

### §6 Compliance Automation — add Account Deletion detection

Add a detection step before enforcement:

```
Compliance runner determines account-deletion applicability per deploy:

1. Parse shippie.json permissions block
2. Static-analyze build output + functions for:
   - shippie.auth.* calls
   - shippie.db.set/get/list with user-scoped data (non-public)
   - shippie.files.upload
   - shippie.track with identifiable properties
3. If any detected → account deletion is REQUIRED
4. If none detected AND permissions declare no user data → account deletion is NOT_APPLICABLE
5. Write result to compliance_checks.status:
   - passed (enabled and functional)
   - failed (required but missing)
   - not_applicable (app is stateless / anonymous)

The Native Readiness Score treats `not_applicable` as neutral — it neither helps
nor blocks. The maker sees a clear "Not needed for this app" indicator in the
readiness dashboard.
```

### §12 Schema — update `account_deletion_requests` comment

No schema change to the table itself, but add a comment:
```sql
comment on table account_deletion_requests is
  'Populated only when an app retains user data. Stateless apps never have rows here. Compliance runner enforces this via shippie.json permissions + static analysis.';
```

### §17 Key Risks — remove "too strict readiness ladder"

Remove the implicit assumption that every app needs deletion. Add:
> **Compliance false positives on anonymous apps** (LOW) — static analysis might flag an anonymous utility as needing account deletion. Manual override available in compliance UI; readiness score unaffected when maker confirms `not_applicable`.

---

## Summary of Patches

| # | Severity | Area | Change |
|---|----------|------|--------|
| 1 | P1 | `store_credentials` schema | Polymorphic `subject_type` / `subject_id` (user or org), matching `subscriptions` |
| 2 | P1 | Ship to Stores UI | iOS launch = TestFlight via Prep Kit only; Production track + Shippie-managed signing labelled Phase 2/3 and disabled in UI |
| 3 | P2 | `__shippie/*` collisions | Hard block (no auto-rename); only `manifest.json` / `sw.js` handled by existing `conflict_policy` |
| 4 | P2 | `needs_secrets` model | Moved to `deploys.status`; `apps` gets `latest_deploy_id` / `active_deploy_id` / `preview_deploy_id`; same deploy row re-used on retry |
| 5 | P2 | Native Readiness Score | Account deletion conditional on detected data retention; stateless apps get `not_applicable` and are unaffected |

All patches keep the contract between the maker promise and the launch implementation consistent. No scope is removed.

---

## Application Notes

1. These patches modify v5. After applying, rename the file to `shippie-implementation-plan-v5.1.md` or keep both v5 + v5.1-patches in the folder for traceability.
2. The database migrations implied by Patches 1 and 4 should land in a single migration (`0003_v51_patches.sql`) since they touch `store_credentials`, `deploys`, and `apps`.
3. The UI changes in Patch 2 affect `apps/web/app/(dashboard)/apps/[slug]/stores/` — specifically the target selector and credentials selector components.
4. The compliance runner changes in Patch 5 affect `lib/compliance/checks/account-deletion.ts` (new) and the scoring function in `lib/compliance/runner.ts`.
5. After applying, re-run the Quick Ship SLO harness to confirm no regression from the Patch 3 hard-block change (a few legitimate projects may now block where they previously silently broke; collect metrics).

---

## Open Questions For Next Review

1. Should Pro-tier store credentials be shareable across apps the same user owns, or scoped per-app? (Current patch: shared across all user's apps, matching how Vercel/Render handle tokens.)
2. Should the "not_applicable" readiness items be hidden or shown greyed-out in the readiness UI? (Recommendation: shown with a "Not needed for this app" label, so makers understand the shape of the gate.)
3. For iOS Prep Kit launch: should we ship a hosted web UI that walks the maker through the local `shippie ios-build` step with live error capture, or keep it to docs-only for launch? (Recommendation: docs-only at launch, hosted walkthrough in Phase 2.)
4. After Patch 4, should the old `apps.deploy_status` column be dropped immediately or kept for one migration cycle as a safety net? (Recommendation: drop immediately — v5 hasn't shipped yet so there's no production data.)

---

## Ready for Implementation

With these five patches applied, v5.1 aligns the maker promise with the launch implementation across:
- Pricing (solo Pro makers can actually use Ship to Stores)
- Ship to Stores UI (only shows paths the backend can fulfill)
- Build correctness (no silent rewriting of bundler output)
- Deploy history (per-version needs_secrets state)
- Native Readiness (conditional account deletion requirement)

No new weeks added to the 14-week plan. All patches are scope-correcting, not scope-expanding.
