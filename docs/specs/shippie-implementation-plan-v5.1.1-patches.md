# Shippie v5.1.1 — Patch-on-Patch

Five fixes to `shippie-implementation-plan-v5.1-patches.md` based on Codex review (2026-04-14).
All five findings are accepted as valid.

| # | Severity | v5.1 Issue | v5.1.1 Fix |
|---|----------|------------|------------|
| A | P1 | iOS launch path doesn't name real signing prerequisites (Team ID + ASC API key is upload, not signing) | Expand Prep Kit requirements to include the actual signing path (Xcode automatic OR manual cert+profile) |
| B | P1 | `sync_app_latest_deploy` trigger skips same-row status transitions | Rewrite predicate so same-deploy-row retries update the app |
| C | P1 | RLS prose referenced `user_id = current_user` but schema has `subject_type`/`subject_id` | Concrete RLS policies against the actual columns; roles aligned with existing org model |
| D | P2 | Store credentials at subject level mixes account-level secrets with app-bound signing assets | Split into `store_account_credentials` (reusable) + `app_signing_configs` (per-app, active-selected) |
| E | P2 | Account-deletion applicability rule depends on runtime analytics payloads the compliance runner can't inspect | Make applicability derive from `shippie.json` permissions + explicit `compliance.retains_user_data` flag — no runtime inspection |

This patch supersedes Patches 1, 2, 4, and 5 of v5.1 in the specific sections called out below. Patch 3 (hard-block on `__shippie/*` collisions) is unchanged.

---

## Fix A — iOS signing prerequisites (replaces v5.1 Patch 2, signing-credentials section)

### The gap
A maker with an Apple Developer account, a Team ID, and an App Store Connect API key still cannot sign an iOS build. For a local build on a Mac you need one of:
- **Automatic signing** — Xcode logged in with an Apple ID that is a member of the Team. Xcode manages certs + provisioning profiles on demand.
- **Manual signing** — a Distribution certificate (.p12) + a matching App Store provisioning profile downloaded from the Apple Developer portal, installed into Keychain / Xcode.

The ASC API key (.p8 + Key ID + Issuer ID) is **upload-only** — it feeds `xcrun altool` or `xcrun notarytool` after the build is already signed. It does not sign anything.

v5.1's copy glossed over this. A maker following the documented steps would hit "Code signing error" locally and feel deceived.

### Fix — replace the iOS signing block in §5 (v5 line 316) with:

```
iOS (launch — Prep Kit only):

Required before "Ready to build" in dashboard:

  1. Apple Developer Program membership ($99/yr) — verified by maker
     checking a box + providing Team ID (format validated).

  2. One signing path chosen:

     (a) Automatic signing (recommended for solo makers)
         - Mac with Xcode installed
         - Signed into Xcode with an Apple ID belonging to the Team
         - Xcode manages certificates and provisioning profiles
         - No assets stored in Shippie
         - Prep Kit is emitted with ENABLE_AUTOMATIC_CODE_SIGNING=YES

     (b) Manual signing
         - Distribution certificate (.p12) uploaded to Shippie,
           stored in app_signing_configs.ios_certificate_r2_key
         - App Store provisioning profile (.mobileprovision) matching
           the app's bundle_id, uploaded and stored in
           app_signing_configs.ios_provisioning_profile_r2_key
         - Prep Kit installs both into the Xcode build folder
         - Prep Kit emits ENABLE_AUTOMATIC_CODE_SIGNING=NO
         - Maker's Keychain must trust the .p12 password at build time

  3. Upload credentials (optional but recommended):
     - App Store Connect API key (.p8) + Key ID + Issuer ID
     - Stored in store_account_credentials with credential_type='asc_api_key'
     - Used by the Prep Kit's Fastlane lane to upload the signed IPA to
       TestFlight via `xcrun altool --upload-app`
     - If omitted: maker can upload manually via Xcode Organizer

Launch UI gates:
  - Dashboard shows a checklist: Dev Program ✓ / Signing path ✓ / Upload creds (optional)
  - "Build Prep Kit" button disabled until #1 and #2 are satisfied
  - Explicit Mac-required warning: "This flow requires a Mac running
    Xcode 15+ to complete the build locally. Linux/Windows makers should
    wait for Phase 2 (partner runner, ETA shown)."
```

### Also — add a preflight verification task

Before the Prep Kit is emitted, the compliance runner should invoke a synthetic "Can this app be signed?" check:

```typescript
// lib/compliance/checks/ios-signing-prerequisites.ts
export const iosSigningPrerequisites: ComplianceCheck = {
  id: 'ios-signing-prerequisites',
  platform: 'ios',
  required: true,                          // blocks Ship to Stores if failed
  runsWhen: (ctx) => ctx.targets.includes('ios'),
  async run(ctx) {
    const config = await getAppSigningConfig(ctx.appId, 'ios')
    if (!config) return fail('No iOS signing config registered')
    if (!config.iosTeamId) return fail('Apple Team ID missing')
    if (config.iosSigningMode === 'manual') {
      if (!config.iosCertificateR2Key) return fail('Distribution certificate missing')
      if (!config.iosProvisioningProfileR2Key) return fail('Provisioning profile missing')
    } else if (config.iosSigningMode !== 'automatic') {
      return fail(`Unknown signing mode: ${config.iosSigningMode}`)
    }
    return pass({ signing_mode: config.iosSigningMode })
  },
}
```

Adds teeth to the checklist — the score cannot reach 85 for iOS targets until the check passes.

---

## Fix B — Same-row deploy trigger (replaces v5.1 Patch 4 trigger)

### The bug
v5.1's `sync_app_latest_deploy` trigger has this predicate:

```sql
where id = NEW.app_id
  and (latest_deploy_id is null
       or (select version from deploys where id = latest_deploy_id) < NEW.version);
```

Patch 4 explicitly reuses the same `deploys` row when a `needs_secrets` deploy resumes (`needs_secrets → building → success` on one version). On the second UPDATE, `latest_deploy_id` already points at this deploy and `version` is equal, not less — so the predicate is false and `apps.latest_deploy_status` stays stale forever.

### Fix — replace the trigger function

```sql
create or replace function sync_app_latest_deploy() returns trigger as $$
declare
  current_latest_version int;
begin
  select version into current_latest_version
    from deploys
   where id = (select latest_deploy_id from apps where id = NEW.app_id);

  -- Update apps.latest_* when:
  -- (1) app has no latest deploy yet, OR
  -- (2) this IS the current latest deploy (same-row status transition), OR
  -- (3) this deploy's version is newer than the current latest
  update apps
     set latest_deploy_id     = NEW.id,
         latest_deploy_status = NEW.status,
         updated_at           = now()
   where id = NEW.app_id
     and (
       latest_deploy_id is null
       or latest_deploy_id = NEW.id
       or coalesce(current_latest_version, -1) <= NEW.version
     );

  return NEW;
end $$ language plpgsql;

drop trigger if exists deploys_sync_app_latest on deploys;
create trigger deploys_sync_app_latest
  after insert or update of status on deploys
  for each row execute function sync_app_latest_deploy();
```

Key changes:
1. **`latest_deploy_id = NEW.id`** — catches same-row status transitions (needs_secrets → building → success)
2. **`<=` instead of `<`** — handles concurrent deploys at the same version number defensively
3. **`coalesce(..., -1)`** — explicit null handling instead of relying on subquery ordering

### Test cases the fix must cover

```
Case 1 — First deploy (v1, building → success)
  → latest_deploy_* tracks v1 throughout both transitions

Case 2 — needs_secrets retry on same row (v2: building → needs_secrets → building → success)
  → latest_deploy_status reflects each transition, latest_deploy_id stays v2

Case 3 — New version after an existing live version (v1 live, v2: building → success)
  → latest_deploy_id moves from v1 to v2 on first update; stays v2 through success

Case 4 — Failed deploy (v3: building → failed)
  → latest_deploy_id moves to v3, status=failed; active_deploy_id stays on last success

Case 5 — Rollback (active_deploy_id set to older v1)
  → latest_deploy_* untouched (this update is on apps, not deploys)
```

Add these as integration tests in `apps/web/lib/db/migrations/0003_v51_patches.test.sql` (or the equivalent test harness).

---

## Fix C — RLS policies reference real columns (replaces v5.1 Patch 1 RLS prose)

### The gap
v5.1 had prose: "The user themselves (if `subject_type = 'user'` and `user_id = current_user`)". The new schema has `subject_id`, not `user_id`. And "billing_manager" is already in the v5 org role model (§7 plans table + alter in §12) so that part was fine — but the code never showed the SQL.

### Fix — concrete RLS policies for `store_credentials`

> Note: Fix D renames this table to `store_account_credentials` and adds `app_signing_configs`. The RLS policies below apply to both tables — reproduce the same pattern on `app_signing_configs` replacing `store_credentials` with `app_signing_configs` and resolving ownership via `apps.organization_id` / `apps.maker_id` instead.

```sql
alter table store_account_credentials enable row level security;

-- Read/write for user-owned credentials: only the owner
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

-- Read/write for org-owned credentials: only owner/admin/billing_manager
create policy sac_org_rw on store_account_credentials
  for all
  using (
    subject_type = 'organization'
    and exists (
      select 1
        from organization_members om
       where om.org_id  = store_account_credentials.subject_id
         and om.user_id = current_setting('app.current_user_id', true)::uuid
         and om.role in ('owner', 'admin', 'billing_manager')
    )
  )
  with check (
    subject_type = 'organization'
    and exists (
      select 1
        from organization_members om
       where om.org_id  = store_account_credentials.subject_id
         and om.user_id = current_setting('app.current_user_id', true)::uuid
         and om.role in ('owner', 'admin', 'billing_manager')
    )
  );
```

### `app_signing_configs` RLS

```sql
alter table app_signing_configs enable row level security;

-- Access derived from the owning app's ownership
create policy asc_rw on app_signing_configs
  for all
  using (
    exists (
      select 1 from apps a
      where a.id = app_signing_configs.app_id
        and (
          -- User-owned app: only the maker
          (a.organization_id is null
            and a.maker_id = current_setting('app.current_user_id', true)::uuid)
          -- Org-owned app: org members with sufficient role
          or (a.organization_id is not null
            and exists (
              select 1 from organization_members om
              where om.org_id  = a.organization_id
                and om.user_id = current_setting('app.current_user_id', true)::uuid
                and om.role in ('owner', 'admin', 'developer', 'billing_manager')
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
                and om.role in ('owner', 'admin', 'billing_manager')
              -- developers CAN read/write per-app signing config but NOT account credentials
            ))
        )
    )
  );
```

### Role intent summary

| Role | Read account creds | Write account creds | Read per-app signing | Write per-app signing |
|------|-------------------|---------------------|----------------------|----------------------|
| `owner` | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ |
| `billing_manager` | ✓ | ✓ | ✓ | ✓ |
| `developer` | ✗ | ✗ | ✓ | ✓ |
| `viewer` | ✗ | ✗ | ✗ | ✗ |

Account credentials are billing-sensitive (they authenticate to store accounts). Per-app signing assets are dev-lifecycle concerns (developers need them for deploys but should never touch the billing account).

---

## Fix D — Split account credentials from per-app signing config (replaces v5.1 Patch 1 schema + helper)

### The gap
v5.1 put everything into one `store_credentials` table keyed at subject level. That works for **reusable account credentials** (ASC API key, Play Console service account JSON) but not for **app-specific signing assets**:

- iOS provisioning profile is bound to a specific bundle ID and team
- Android keystore is typically per-app (per package name)
- The `findMany` helper returns all credentials for a platform with no "active selection" — at build time the system can't tell which certificate/profile pair to use

### Fix — two tables

Drop the v5.1 `store_credentials` table. Replace with:

```sql
-- Reusable, subject-scoped: one ASC API key covers every app this user/org owns
create table store_account_credentials (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'organization')),
  subject_id uuid not null,
  platform text not null check (platform in ('ios', 'android')),
  credential_type text not null check (credential_type in (
    'asc_api_key',          -- iOS: App Store Connect API (.p8 + Key ID + Issuer ID)
    'play_service_account'  -- Android: Google Play Developer API service account JSON
  )),
  label text not null,                           -- maker-chosen, e.g., "Acme Dev Account"
  encrypted_value text not null,                 -- AES-GCM
  metadata jsonb,
  created_at timestamptz default now(),
  rotated_at timestamptz,
  unique (subject_type, subject_id, platform, credential_type, label)
);

create index sac_subject_idx
  on store_account_credentials (subject_type, subject_id, platform);

-- Per-app, platform-scoped, exactly one active config per (app, platform)
create table app_signing_configs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  account_credential_id uuid
    references store_account_credentials(id) on delete restrict,
  is_active boolean default true,
  version int not null default 1,                -- monotonic per (app, platform)

  -- iOS-specific
  ios_bundle_id text,
  ios_team_id text,
  ios_signing_mode text check (ios_signing_mode in ('automatic', 'manual')),
  ios_certificate_r2_key text,                   -- .p12 (encrypted at rest)
  ios_certificate_password_encrypted text,
  ios_provisioning_profile_r2_key text,          -- .mobileprovision
  ios_entitlements_plist_r2_key text,            -- optional

  -- Android-specific
  android_package text,
  android_keystore_r2_key text,                  -- .jks or .keystore
  android_keystore_password_encrypted text,
  android_key_alias text,
  android_key_password_encrypted text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references users(id)
);

-- Exactly one active config per (app, platform) at any time
create unique index app_signing_configs_active_unique
  on app_signing_configs (app_id, platform)
  where is_active = true;

create index app_signing_configs_app_platform_idx
  on app_signing_configs (app_id, platform);
```

### Resolver helper (single source of truth)

```typescript
// lib/stores/signing.ts
import { and, eq } from 'drizzle-orm'

export type ResolvedSigningConfig = {
  appSigningConfig: AppSigningConfig
  accountCredential: StoreAccountCredential | null
}

export async function resolveSigningConfig(
  app: { id: string; organization_id: string | null; maker_id: string },
  platform: 'ios' | 'android',
): Promise<ResolvedSigningConfig> {
  const signingConfig = await db.query.appSigningConfigs.findFirst({
    where: and(
      eq(appSigningConfigs.appId, app.id),
      eq(appSigningConfigs.platform, platform),
      eq(appSigningConfigs.isActive, true),
    ),
  })
  if (!signingConfig) {
    throw new Error(`No active signing config for app ${app.id} on ${platform}`)
  }

  const accountCredential = signingConfig.accountCredentialId
    ? await db.query.storeAccountCredentials.findFirst({
        where: eq(storeAccountCredentials.id, signingConfig.accountCredentialId),
      })
    : null

  // Sanity: the account credential's subject must match the app's owner
  if (accountCredential) {
    const expectedSubject = app.organization_id
      ? { type: 'organization', id: app.organization_id }
      : { type: 'user',         id: app.maker_id }
    if (
      accountCredential.subjectType !== expectedSubject.type ||
      accountCredential.subjectId !== expectedSubject.id
    ) {
      throw new Error(
        `Signing config references an account credential owned by a different subject`
      )
    }
  }

  return { appSigningConfig: signingConfig, accountCredential }
}
```

Active selection is unambiguous (the partial unique index enforces exactly one active row per (app, platform)). Multi-config rotation works by creating a new row with `is_active = false`, then atomically flipping the old to inactive and the new to active inside one transaction (the unique index prevents races).

### Credential rotation policy

```sql
-- Rotation: create new, flip active in one transaction
begin;
  insert into app_signing_configs (app_id, platform, is_active, version, ...) values (...);
  update app_signing_configs set is_active = false
    where app_id = $1 and platform = $2 and id != $new_id;
commit;
```

The new-row-first pattern avoids a window where no active config exists.

### Ship-to-Stores build flow (updated)

```
Submit triggered
  ↓
Resolve signing config → resolveSigningConfig(app, platform)
  ↓
If missing → block with clear error + link to signing setup UI
  ↓
Materialize signing assets into the build environment:
  - iOS manual: download .p12 + .mobileprovision from R2 to temp dir,
    install into Keychain (Prep Kit case: user's Mac handles this)
  - iOS automatic: emit ENABLE_AUTOMATIC_CODE_SIGNING=YES + DEVELOPMENT_TEAM=<teamId>
  - Android: download keystore from R2 to temp dir, set signingConfig in build.gradle
  ↓
Build
  ↓
Upload:
  - iOS: use account_credential (asc_api_key) via fastlane / altool
  - Android: use account_credential (play_service_account) via Play Developer API v3
  ↓
Clean up temp secrets on exit
```

---

## Fix E — Account deletion applicability uses static facts only (replaces v5.1 Patch 5 detection rules)

### The gap
v5.1 listed "analytics events contain user_id" as a trigger for requiring account deletion. The compliance runner operates at deploy time and can only see static config + build output — it cannot know what runtime analytics payloads will look like. Basing a gate on unknowable facts makes scoring inconsistent.

### Fix — explicit flags in `shippie.json` + narrowed detection

Add to `shippie.json` compliance block:

```jsonc
{
  "compliance": {
    "retains_user_data": true,          // explicit declaration; required for stores
    "identifiable_analytics": false,    // whether shippie.track payloads include user IDs
    "account_deletion": {
      "enabled": true,
      "flow": "self_service"
    }
  }
}
```

### Applicability rule (deterministic, static)

```
Account deletion is REQUIRED if ANY of:

  (a) shippie.json.permissions.auth == true
  (b) shippie.json.permissions.storage != "none"
  (c) shippie.json.permissions.files == true
  (d) shippie.json.compliance.retains_user_data == true   (explicit)
  (e) shippie.json.compliance.identifiable_analytics == true  (explicit)

Otherwise:
  Account deletion is NOT_APPLICABLE
  compliance_checks.account_deletion.status = 'not_applicable'
  Does not block score above 0.
```

### Auto-derivation of `retains_user_data`

If the maker omits `compliance.retains_user_data`, Shippie derives a default:

```
retains_user_data = (
  permissions.auth == true
  OR permissions.storage != "none"
  OR permissions.files == true
)
```

Maker can explicitly set `retains_user_data: true` even for apps without those permissions (e.g., an app that sends user-identifying data to an external API via a Function). Maker cannot set `retains_user_data: false` if any of auth/storage/files is enabled — the runner overrides to true.

### `identifiable_analytics` — default off, explicit on

Analytics via `shippie.track(event, props)` defaults to **non-identifiable** (no user_id, IP hash only, no PII fields in `props`). If the maker wants to track with user identity, they must:

1. Set `compliance.identifiable_analytics: true` in `shippie.json`
2. Call `shippie.track(event, props, { identify: true })` explicitly in code

The SDK respects this flag at runtime — `{ identify: true }` without the manifest flag is a no-op with a console warning. This guarantees the compliance runner's static assertion matches runtime behavior.

### SDK change

```typescript
// packages/sdk/src/analytics.ts
export function track(
  event: string,
  props?: Record<string, unknown>,
  opts?: { identify?: boolean }
) {
  if (opts?.identify && !manifest.compliance?.identifiable_analytics) {
    console.warn(
      '[shippie] track({ identify: true }) requires ' +
      'compliance.identifiable_analytics in shippie.json. Sending anonymously.'
    )
    opts = { ...opts, identify: false }
  }
  // ... send
}
```

Where `manifest` is the app manifest fetched from `/__shippie/meta` at SDK init — so the runtime check uses the same source of truth as deploy-time.

### Compliance check update

```typescript
// lib/compliance/checks/account-deletion.ts
export const accountDeletion: ComplianceCheck = {
  id: 'account-deletion',
  platform: 'both',
  required: true,
  async run(ctx): Promise<ComplianceResult> {
    const manifest = ctx.shippieJson
    const retains =
      manifest.permissions?.auth === true
      || (manifest.permissions?.storage && manifest.permissions.storage !== 'none')
      || manifest.permissions?.files === true
      || manifest.compliance?.retains_user_data === true
      || manifest.compliance?.identifiable_analytics === true

    if (!retains) return notApplicable('App retains no user data')
    if (!manifest.compliance?.account_deletion?.enabled) {
      return fail('Account deletion endpoint required but not enabled')
    }
    // Optional integration test: ping __shippie/fn/_account_delete in dry-run mode
    return pass()
  },
}
```

---

## Migration Ordering

The v5.1.1 fixes require one migration file:

```
0003_v51_patches.sql   (v5.1 base)
0004_v511_patches.sql  (v5.1.1 fixes)
```

`0004_v511_patches.sql` contents (order matters):

1. `drop table store_credentials` (if v5.1 migration created it)
2. `create table store_account_credentials` (new)
3. `create table app_signing_configs` (new)
4. `create unique index app_signing_configs_active_unique` (new)
5. RLS enable + policies (Fix C)
6. `create or replace function sync_app_latest_deploy` (Fix B — same function name, new body)
7. `drop trigger + create trigger` (reattach with new function)
8. No-op migration for `shippie.json` (consumed at runtime, no DB changes for Fix E)

Integration tests for the trigger (Fix B test matrix above) run in CI before merge.

---

## Open Questions Still Outstanding

Carried forward from v5.1 + new ones from v5.1.1:

1. Should `store_account_credentials` support **multiple labels per (subject, platform, type)** (different dev accounts under one org) — or enforce exactly one? **v5.1.1 answer**: yes, multiple via the `label` column, unique on `(subject_type, subject_id, platform, credential_type, label)`.
2. For the iOS Prep Kit, do we also ship a GitHub Action template that runs the build on a self-hosted macOS runner if the maker has one? (Recommendation: yes, Phase 2 — document the pattern in launch docs.)
3. Should the `compliance.identifiable_analytics` flag also require a consent banner in the app? (Recommendation: yes, auto-inject via SDK runtime if `identifiable_analytics: true`, similar to how PWA install prompts are injected.)
4. For the trigger, should we also surface an `active_deploy_status` on `apps` that reflects the **currently serving** deploy instead of the latest? (Recommendation: yes — add `active_deploy_status` as a separate cached column, updated via the same trigger when `apps.active_deploy_id` changes. Cheap win.)

---

## Summary

| Fix | Replaces in v5.1 | Severity | Status |
|-----|------------------|----------|--------|
| A — iOS signing prerequisites | Patch 2, signing section | P1 | Ready |
| B — same-row trigger predicate | Patch 4, trigger function | P1 | Ready with test matrix |
| C — RLS policies use real columns | Patch 1, RLS prose | P1 | Ready |
| D — split account creds from signing configs | Patch 1, schema + helper | P2 | Ready, supersedes single-table design |
| E — static-only account deletion rule | Patch 5, detection rules | P2 | Ready with SDK change |

v5.1.1 + v5.1 (Patch 3 unchanged) + v5 baseline = the implementable master spec.
The maker promise and the launch implementation now say the same thing.
