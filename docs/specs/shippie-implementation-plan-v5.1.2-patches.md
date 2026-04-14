# Shippie v5.1.2 — Patch-on-Patch-on-Patch

Four fixes to `shippie-implementation-plan-v5.1.1-patches.md` based on Codex review (2026-04-14).

All four findings accepted. Two are implementation bugs; two are trust gaps.

| # | Severity | v5.1.1 Issue | v5.1.2 Fix |
|---|----------|--------------|------------|
| F | P1 | `developer` role in `app_signing_configs` USING clause but missing from WITH CHECK — devs can read but not write | Add `developer` to WITH CHECK (exact mirror of USING) |
| G | P1 | Rotation SQL inserts without explicit `is_active = false`, conflicting with partial unique index | Explicit `is_active = false` on insert; atomic flip via single UPDATE whose constraint is evaluated at statement end |
| H | P2 | Automatic-signing readiness check only inspects config metadata, can't verify maker's Mac — unblocks score on unbuildable configs | Split into `ios-signing-config-registered` (metadata) + `ios-signing-verified` (proven by a local `shippie ios-verify` HMAC callback with 90-day validity) |
| I | P2 | Functions-based apps can collect user data without declaring retention — rule depends on maker honesty | Fail-closed: Functions enabled ⇒ `retains_user_data = true` unless static analysis proves no Function accesses `ctx.user` / `ctx.db` / identifiable fetches |

This patch supersedes the specific sections of v5.1.1 named below. Everything else in v5 / v5.1 / v5.1.1 stands unchanged.

---

## Fix F — `developer` role can actually write `app_signing_configs`

### The bug
v5.1.1 Fix C's policy:

```sql
create policy asc_rw on app_signing_configs
  for all
  using (
    -- includes 'developer' in org_members role check
  )
  with check (
    -- only 'owner', 'admin', 'billing_manager'
  );
```

In PostgreSQL, `FOR ALL` policies use `USING` for row visibility on SELECT/UPDATE/DELETE and `WITH CHECK` for the new row state on INSERT/UPDATE. If `developer` is in `USING` but not `WITH CHECK`, developers can read existing rows but any INSERT or UPDATE they attempt will fail. That directly contradicts the role intent table, which says developers write per-app signing config.

### Fix — replace the `asc_rw` policy in v5.1.1 Fix C

```sql
alter table app_signing_configs enable row level security;

-- Single policy; USING and WITH CHECK are exact mirrors.
-- Roles: owner, admin, billing_manager, developer can both read AND write.
-- viewer can do neither (not present in either clause).
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
          -- Org-owned app: owner/admin/billing_manager/developer
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
```

The USING and WITH CHECK clauses are now byte-identical (modulo table reference). This is the only safe way to guarantee "whoever can see a row can modify it to the same predicate" without subtle write-but-not-read or read-but-not-write holes.

### Reconciling with `store_account_credentials`
`store_account_credentials` deliberately **excludes** `developer` from both clauses — account credentials are billing-sensitive. Only `owner`, `admin`, and `billing_manager` can read/write. This asymmetry is intentional and documented in the role intent table (v5.1.1 Fix C).

### Test cases the fix must cover

```
Case 1 — Developer in org creates app_signing_configs row for org-owned app
  → INSERT succeeds (WITH CHECK satisfied)

Case 2 — Developer in org updates existing row (rotate cert)
  → UPDATE succeeds (both USING and WITH CHECK satisfied)

Case 3 — Viewer in org attempts INSERT
  → fails (not in either clause)

Case 4 — Developer in org A cannot touch rows for app owned by org B
  → fails (USING → apps→organization_id match fails)

Case 5 — Developer attempts to modify store_account_credentials
  → fails on that table's separate policy (developer not included there)
```

Add these to `0004_v511_patches.test.sql` (already planned) — the test matrix from v5.1.1 Fix B extends here.

---

## Fix G — Rotation SQL that actually works with the partial unique index

### The bug
v5.1.1 Fix D's rotation prose:

> ```sql
> begin;
>   insert into app_signing_configs (app_id, platform, is_active, version, ...) values (...);
>   update app_signing_configs set is_active = false
>     where app_id = $1 and platform = $2 and id != $new_id;
> commit;
> ```

Two problems:
1. The `VALUES (...)` placeholder does not specify `is_active`. With the column default of `true`, the new row inserts as active, immediately violating `app_signing_configs_active_unique` (partial unique on `is_active = true`).
2. Even if the insert used `is_active = true` explicitly, the order insert-then-flip fails because the insert itself violates the constraint before the flip can run.

Postgres partial unique indexes are not deferrable, so there is no "fix this at commit time" escape hatch. The rotation must be correct at every statement boundary.

### Fix — insert inactive, then atomic swap via a single UPDATE

The key insight: partial unique indexes are evaluated at **statement end**, not mid-statement. A single UPDATE that flips `is_active` on multiple rows is evaluated once, after all row modifications — so "old row goes from active to inactive, new row goes from inactive to active" is a legal state at statement end because exactly one row ends with `is_active = true`.

```sql
begin;

  -- 1. Insert new config as INACTIVE. The partial unique index does not
  --    cover inactive rows, so this never conflicts.
  insert into app_signing_configs (
    app_id, platform, is_active, version,
    account_credential_id,
    ios_bundle_id, ios_team_id, ios_signing_mode,
    ios_certificate_r2_key, ios_certificate_password_encrypted,
    ios_provisioning_profile_r2_key,
    android_package, android_keystore_r2_key,
    android_keystore_password_encrypted,
    android_key_alias, android_key_password_encrypted,
    created_by
  ) values (
    $app_id, $platform, false, $next_version,
    $account_credential_id,
    $ios_bundle_id, $ios_team_id, $ios_signing_mode,
    $ios_cert_key, $ios_cert_pw,
    $ios_profile_key,
    $android_package, $android_keystore_key,
    $android_keystore_pw,
    $android_key_alias, $android_key_pw,
    $actor_user_id
  )
  returning id as $new_id;

  -- 2. Atomic flip: one UPDATE touches the old active row AND the new row.
  --    Postgres evaluates the partial unique index at statement end;
  --    exactly one row ends with is_active = true, so the constraint holds.
  update app_signing_configs
     set is_active  = (id = $new_id),
         updated_at = now()
   where app_id = $app_id
     and platform = $platform
     and (id = $new_id or is_active = true);

commit;
```

### Why this works (and why the simpler "update-then-insert" doesn't)

**Rejected alternative**: flip old to inactive first, then insert new active:
```sql
update app_signing_configs set is_active = false where ... and is_active = true;
insert into app_signing_configs (..., is_active) values (..., true);
```
Correctness-wise, this works. But between the UPDATE and the INSERT **within the same transaction**, readers at lower isolation levels (`read committed`) of other sessions see "no active config" — fine because they can't see uncommitted writes. Readers within **this** transaction (if the txn does a read between the two statements) also see no active config briefly. Acceptable.

**Chosen alternative** (insert-inactive-then-flip): has the virtue that at every intermediate point in the transaction, there is always at least one row with `is_active = true` from the perspective of `this` transaction's own reads. This matters for the Ship to Stores build flow, which runs inside a single transaction and performs intermediate resolution checks.

### Rotation helper

```typescript
// lib/stores/signing.ts
export async function rotateSigningConfig(
  appId: string,
  platform: 'ios' | 'android',
  newConfig: NewAppSigningConfig,
  actorUserId: string,
): Promise<AppSigningConfig> {
  return db.transaction(async (tx) => {
    // 1. Insert as inactive
    const [inserted] = await tx.insert(appSigningConfigs).values({
      ...newConfig,
      appId,
      platform,
      isActive: false,
      version: await nextConfigVersion(tx, appId, platform),
      createdBy: actorUserId,
    }).returning()

    // 2. Atomic flip
    await tx.update(appSigningConfigs)
      .set({ isActive: sql`(id = ${inserted.id})`, updatedAt: new Date() })
      .where(and(
        eq(appSigningConfigs.appId, appId),
        eq(appSigningConfigs.platform, platform),
        or(
          eq(appSigningConfigs.id, inserted.id),
          eq(appSigningConfigs.isActive, true),
        ),
      ))

    return { ...inserted, isActive: true }
  })
}

async function nextConfigVersion(
  tx: Transaction, appId: string, platform: 'ios' | 'android'
): Promise<number> {
  const row = await tx.select({ v: max(appSigningConfigs.version) })
    .from(appSigningConfigs)
    .where(and(
      eq(appSigningConfigs.appId, appId),
      eq(appSigningConfigs.platform, platform),
    ))
  return (row[0]?.v ?? 0) + 1
}
```

### Integration test

```sql
-- 0004_v511_patches.test.sql — add
do $$
declare
  app_id uuid;
  v1 uuid;
  v2 uuid;
  active_count int;
begin
  app_id := gen_random_uuid();
  insert into apps (id, slug, name, type, category, source_type, maker_id)
    values (app_id, 'test', 'Test', 'app', 'tools', 'zip', gen_random_uuid());

  -- First config
  insert into app_signing_configs (id, app_id, platform, is_active, version)
    values (gen_random_uuid(), app_id, 'ios', true, 1)
    returning id into v1;

  -- Rotation using the documented pattern
  begin;
    insert into app_signing_configs (id, app_id, platform, is_active, version)
      values (gen_random_uuid(), app_id, 'ios', false, 2)
      returning id into v2;
    update app_signing_configs
      set is_active = (id = v2)
      where app_id = app_id and platform = 'ios'
        and (id = v2 or is_active = true);
  commit;

  -- Verify exactly one active
  select count(*) into active_count
    from app_signing_configs
    where app_id = app_id and platform = 'ios' and is_active = true;
  assert active_count = 1, 'Expected exactly one active config after rotation';

  -- Verify v2 is the active one
  assert (select id from app_signing_configs
          where app_id = app_id and platform = 'ios' and is_active = true) = v2,
         'Expected v2 to be the active config';
end $$;
```

---

## Fix H — Honest iOS automatic-signing verification (replaces v5.1.1 Fix A compliance check)

### The gap
v5.1.1's `ios-signing-prerequisites` check:

```typescript
if (config.iosSigningMode === 'manual') {
  // verifies cert + profile R2 keys exist
}
// automatic mode just falls through to pass()
```

For manual signing this is defensible — we can statically verify the cert and provisioning profile exist in R2, parse the profile plist to confirm bundle ID + team ID match, and even decrypt the .p12 to check validity.

For **automatic signing**, we cannot verify anything server-side. The prerequisites (Mac, Xcode, Apple ID in the right Team) live entirely on the maker's machine. v5.1.1 passes the check based on metadata alone, which means the dashboard unblocks score ≥85 for a config the maker may be unable to actually build.

### Fix — split into two checks + introduce a verification token flow

Replace the single `ios-signing-prerequisites` check with two:

```typescript
// lib/compliance/checks/ios-signing-config-registered.ts
// Passes when metadata is complete for the declared signing mode.
export const iosSigningConfigRegistered: ComplianceCheck = {
  id: 'ios-signing-config-registered',
  platform: 'ios',
  required: true,
  runsWhen: (ctx) => ctx.targets.includes('ios'),
  async run(ctx) {
    const config = await resolveSigningConfig(ctx.app, 'ios')
    if (!config) return fail('No iOS signing config registered')
    if (!config.appSigningConfig.iosTeamId) return fail('Apple Team ID missing')
    if (!config.appSigningConfig.iosBundleId) return fail('Bundle ID missing')
    if (config.appSigningConfig.iosSigningMode === 'manual') {
      const { iosCertificateR2Key, iosProvisioningProfileR2Key } = config.appSigningConfig
      if (!iosCertificateR2Key)        return fail('Distribution certificate missing')
      if (!iosProvisioningProfileR2Key) return fail('Provisioning profile missing')
      // Parse .mobileprovision: verify TeamIdentifier matches ios_team_id
      //                         verify app-id suffix matches ios_bundle_id
      //                         verify ExpirationDate > now() + 30 days
      const profile = await parseMobileProvision(iosProvisioningProfileR2Key)
      if (profile.teamIdentifier !== config.appSigningConfig.iosTeamId) {
        return fail('Provisioning profile team does not match declared Team ID')
      }
      if (!profile.appId.endsWith(config.appSigningConfig.iosBundleId)) {
        return fail('Provisioning profile bundle ID does not match declared ios_bundle_id')
      }
      if (profile.expiresAt.getTime() < Date.now() + 30 * 24 * 3600 * 1000) {
        return fail('Provisioning profile expires within 30 days — rotate before submission')
      }
    } else if (config.appSigningConfig.iosSigningMode !== 'automatic') {
      return fail(`Unknown signing mode: ${config.appSigningConfig.iosSigningMode}`)
    }
    return pass({ mode: config.appSigningConfig.iosSigningMode })
  },
}

// lib/compliance/checks/ios-signing-verified.ts
// Passes only when a recent, signed, maker-supplied verification exists.
export const iosSigningVerified: ComplianceCheck = {
  id: 'ios-signing-verified',
  platform: 'ios',
  required: true,
  runsWhen: (ctx) => ctx.targets.includes('ios'),
  async run(ctx) {
    const config = await resolveSigningConfig(ctx.app, 'ios')
    if (!config) return fail('No iOS signing config registered')

    // Manual signing: we can verify statically, so it's always "verified".
    if (config.appSigningConfig.iosSigningMode === 'manual') {
      return pass({ source: 'static-manual' })
    }

    // Automatic signing: requires a fresh verification token.
    const verification = await db.query.iosSigningVerifications.findFirst({
      where: and(
        eq(iosSigningVerifications.appId, ctx.app.id),
        isNotNull(iosSigningVerifications.succeededAt),
      ),
      orderBy: desc(iosSigningVerifications.succeededAt),
    })

    if (!verification) {
      return needsAction(
        'iOS automatic signing not verified yet. Run `shippie ios-verify` on your Mac to confirm Xcode can sign this bundle. Valid for 90 days.',
        { cta: 'download-ios-verify-kit', app_id: ctx.app.id }
      )
    }

    const ageDays = (Date.now() - verification.succeededAt.getTime()) / (24 * 3600 * 1000)
    if (ageDays > 90) {
      return needsAction(
        `Last iOS signing verification was ${Math.floor(ageDays)} days ago. Re-run \`shippie ios-verify\` (valid for 90 days).`,
        { cta: 'download-ios-verify-kit', app_id: ctx.app.id }
      )
    }

    return pass({
      source: 'verify-kit',
      verified_at: verification.succeededAt,
      expires_at: new Date(verification.succeededAt.getTime() + 90 * 24 * 3600 * 1000),
    })
  },
}
```

A new compliance result type `needsAction` is introduced — distinct from `fail`. The readiness score treats `needsAction` the same as `fail` (blocks ≥85) but the UI surfaces the specific CTA to the maker. This avoids confusing "something is broken" with "you need to do the next step."

### New table — `ios_signing_verifications`

```sql
create table ios_signing_verifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid references app_signing_configs(id),
  requested_at timestamptz default now(),
  succeeded_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  xcode_version text,
  macos_version text,
  log_r2_key text,                         -- truncated xcodebuild log
  nonce text unique not null,              -- maker-side HMAC nonce
  hmac_signature text,                     -- HMAC-SHA256 over nonce + app_id + result
  verify_kit_version int not null
);
create index ios_signing_verifications_app_idx
  on ios_signing_verifications (app_id, succeeded_at desc);
```

### `shippie ios-verify` CLI (part of the Prep Kit download)

```
# Generated inside the Prep Kit .zip the maker downloads
#!/usr/bin/env bash
set -euo pipefail

APP_ID="__APP_ID__"          # baked in by Shippie at download time
NONCE="__NONCE__"            # baked in; one-time use
SECRET="__SHARED_SECRET__"   # baked in; scoped to this Prep Kit
CALLBACK_URL="https://shippie.app/api/internal/ios-signing-verify"

cd "$(dirname "$0")/ios"
echo "[shippie ios-verify] Running xcodebuild signing pass (no archive upload)…"

LOG=$(mktemp)
if xcodebuild \
     -workspace App.xcworkspace \
     -scheme App \
     -configuration Release \
     -sdk iphoneos \
     -destination "generic/platform=iOS" \
     -showBuildSettings \
     CODE_SIGN_STYLE=Automatic \
     DEVELOPMENT_TEAM="__TEAM_ID__" \
     > "$LOG" 2>&1 ; then
  RESULT=success
  REASON=""
else
  RESULT=failure
  REASON=$(tail -n 50 "$LOG")
fi

SIG=$(printf "%s|%s|%s" "$APP_ID" "$NONCE" "$RESULT" \
      | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

LOG_B64=$(base64 < "$LOG" | tr -d '\n')

curl -fsS -X POST "$CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"nonce\":\"$NONCE\",\"result\":\"$RESULT\",\"hmac\":\"$SIG\",\"reason\":\"$REASON\",\"log_b64\":\"$LOG_B64\",\"xcode_version\":\"$(xcodebuild -version | head -1)\",\"macos_version\":\"$(sw_vers -productVersion)\"}"

[[ "$RESULT" == success ]] || { echo "Verification failed. See $LOG"; exit 1; }
echo "[shippie ios-verify] Success. Dashboard will unlock iOS submission."
```

Key properties:
- **Nonce is one-time**: server rejects reused nonces (insert into `ios_signing_verifications` with unique constraint)
- **HMAC prevents tampering**: the result is signed with a per-Prep-Kit secret; you cannot forge a success from a server-side attack without the secret
- **No archive uploaded**: `xcodebuild -showBuildSettings` with code-sign style=Automatic exercises the signing path without producing an .ipa. Fast (~10–20s).
- **Logs stored truncated**: failure logs persist so makers can debug without re-running. 50 KB cap, oldest dropped.

### Dashboard UX flow

```
Maker configures automatic signing → iosSigningConfigRegistered passes
  ↓
iosSigningVerified returns needsAction
  ↓
Dashboard shows: "Run `shippie ios-verify` on your Mac to prove Xcode can sign this app"
  [ Download verify kit ]
  ↓
Maker downloads kit, runs ./shippie-ios-verify
  ↓
Server receives callback, validates HMAC + nonce, writes ios_signing_verifications row
  ↓
iosSigningVerified passes (valid 90 days)
  ↓
Readiness gate unblocks
```

90-day expiry is the conservative choice: long enough that makers don't re-verify every deploy, short enough that a rotated Apple ID password or expired cert gets caught before a real submission.

### Score impact

Both checks (`ios-signing-config-registered` + `ios-signing-verified`) are **required: true** for iOS targets. Automatic signing mode cannot reach score ≥85 without a fresh verification token. Manual signing reaches ≥85 purely statically because we can verify the cert/profile server-side.

This matches reality: manual signing is inherently auditable, automatic signing is inherently self-attested + locally verifiable.

---

## Fix I — Functions-aware account-deletion applicability (replaces v5.1.1 Fix E applicability rule)

### The gap
v5.1.1 Fix E derives `retains_user_data` from `permissions.auth/storage/files` plus an explicit `compliance.retains_user_data` flag. That correctly kills the runtime dependency, but it leaves a trust hole: an app can enable `functions.enabled: true`, write Functions that call `ctx.user.id` + `ctx.fetch('https://internal-db.example.com/users', { body })`, and declare `auth: false` / `storage: "none"` / `retains_user_data: false`.

The compliance gate then waves it through as "stateless" even though it is actively shipping PII to an external data store.

### Fix — Functions enabled ⇒ `retains_user_data = true` by default, overridable only after static proof

### Applicability rule (replaces the one in v5.1.1 Fix E)

```
Stage 1 — Hard triggers (no override allowed):

  retains_user_data = TRUE if ANY of:
    (a) shippie.json.permissions.auth          == true
    (b) shippie.json.permissions.storage       != "none"
    (c) shippie.json.permissions.files         == true
    (d) shippie.json.compliance.retains_user_data == true  (explicit declaration)
    (e) shippie.json.compliance.identifiable_analytics == true

Stage 2 — Functions default (override requires static proof):

  If shippie.json.functions.enabled == true:
    Default retains_user_data = TRUE
    Maker may set compliance.retains_user_data = false ONLY IF the static
    analyzer proves the Functions bundle is stateless — see below.

Stage 3 — Fail-closed:

  If none of the above applied and the analyzer could not run or
  returned inconclusive: retains_user_data = TRUE

  Maker cannot override "inconclusive" to false.
```

### Static analyzer — what "stateless Functions" actually means

A Functions bundle is stateless if, for every function handler in the bundle, the AST walk finds **none** of:

1. **Any reference to `ctx.user`** — reading user identity inside a function implies user-scoped behavior
2. **Any call to `ctx.db.*`** — platform storage writes
3. **Any call to `ctx.files.*`** — platform file writes
4. **Any outbound `ctx.fetch(...)` whose request includes**:
   - A `body` containing a template literal / variable derived from `ctx.user.*`
   - A `body` containing a template literal / variable derived from `ctx.request.body` (user input forwarded outbound)
   - Headers containing variables derived from `ctx.user.*` (e.g., `Authorization: Bearer ${ctx.user.id}`)
   - A URL path containing `ctx.user.*` interpolation
5. **Any dynamic import or `require()`** — escape hatches the analyzer cannot trace
6. **Any use of `eval`, `Function()` constructor, or string-to-function conversion**
7. **Any secret whose name matches known identity/data patterns**: `DATABASE_URL`, `SUPABASE_*`, `FIREBASE_*`, `DYNAMODB_*`, `REDIS_URL`, `MONGODB_URI`, `AIRTABLE_API_KEY`, `NOTION_TOKEN`, `HUBSPOT_*`, `SALESFORCE_*`, `POSTGRES_*`, etc.

If **any** of the above is found, or if the analyzer cannot fully resolve a call graph (e.g., a function calls another module via a computed path), the result is `inconclusive` and the fail-closed rule applies.

### `shippie.json` — new `compliance.functions_are_stateless` opt-in (read-only from maker)

The analyzer's result is written back into the deploy artifact's compliance report, not into `shippie.json`. The maker sees:

```
Functions analysis:
  ✓ No references to ctx.user
  ✓ No writes to ctx.db or ctx.files
  ✓ No outbound calls contain user-derived data
  ✗ Suspicious secret name: DATABASE_URL
  ✗ Dynamic import: lazyLoad('./adapters/' + ctx.env.ADAPTER)

Verdict: INCONCLUSIVE — treating as retains_user_data=true
```

If the maker wants to clear the inconclusive verdict, they must remove the offending patterns and redeploy. There is no runtime override for inconclusive. Makers *can* set `compliance.retains_user_data = false` explicitly — but when Functions are enabled, the analyzer gates that claim: if the bundle is not provably stateless, the declaration is ignored and the dashboard shows a warning.

### Migration for existing makers

For apps deployed before v5.1.2 that have Functions enabled:
1. On next deploy, the analyzer runs.
2. If inconclusive or positive, `retains_user_data` is force-set to true.
3. Makers are notified via email + dashboard banner: "Your app's account deletion requirement changed based on Functions analysis. Review the deploy report."

### Check update

```typescript
// lib/compliance/checks/account-deletion.ts
export const accountDeletion: ComplianceCheck = {
  id: 'account-deletion',
  platform: 'both',
  required: true,
  async run(ctx): Promise<ComplianceResult> {
    const m = ctx.shippieJson

    // Stage 1 — hard triggers
    const hardTriggered =
      m.permissions?.auth === true
      || (m.permissions?.storage && m.permissions.storage !== 'none')
      || m.permissions?.files === true
      || m.compliance?.retains_user_data === true
      || m.compliance?.identifiable_analytics === true

    // Stage 2 — Functions default
    let functionsTriggered = false
    if (m.functions?.enabled === true) {
      const fnAnalysis = await ctx.deploy.getFunctionsAnalysis()
      if (!fnAnalysis || fnAnalysis.verdict !== 'stateless') {
        functionsTriggered = true
      }
    }

    const retainsData = hardTriggered || functionsTriggered

    if (!retainsData) {
      return notApplicable('App has no user-retaining features or Functions')
    }

    if (!m.compliance?.account_deletion?.enabled) {
      return fail(
        'Account deletion required but not enabled. ' +
        (functionsTriggered
          ? 'Triggered by Functions analysis (not provably stateless).'
          : 'Triggered by declared permissions.')
      )
    }

    // Optional: run account deletion endpoint integration test in dry-run mode
    return pass()
  },
}
```

### Why this is fail-closed in the right direction

The only way for a Functions-enabled app to be classified `retains_user_data = false` is for the static analyzer to explicitly prove the Functions bundle is stateless. Maker honesty is not required; the burden of proof is on the code. If the analyzer is uncertain, the gate closes. This matches how real compliance regimes handle uncertainty (ADA, HIPAA, GDPR DPIA) — when in doubt, treat it as regulated.

---

## Migration Ordering (updated)

```
0003_v51_patches.sql     (v5.1 base — includes v5.1.1's store_account_credentials + app_signing_configs)
0004_v511_patches.sql    (v5.1.1 — trigger fix, RLS policies)
0005_v512_patches.sql    (v5.1.2 — THIS patch)
```

`0005_v512_patches.sql` contents:

1. `drop policy` + `create policy` to replace `asc_rw` with developer included in WITH CHECK (Fix F)
2. `create table ios_signing_verifications` (Fix H)
3. No DDL for Fix G — it's a documentation correction; the rotation logic lives in app code (`lib/stores/signing.ts`)
4. No DDL for Fix I — it's a static-analyzer change in `lib/compliance/functions-analysis.ts`, and the check logic update in `lib/compliance/checks/account-deletion.ts`

Tests added:
- `0005_v512_patches.test.sql` — Fix F role test matrix, Fix G rotation assertion
- `lib/compliance/functions-analysis.test.ts` — inconclusive-verdict test cases
- `lib/stores/signing.test.ts` — rotation race conditions under concurrent deploys
- `lib/compliance/checks/ios-signing-verified.test.ts` — HMAC validation, nonce reuse, 90-day expiry

---

## Summary

| Fix | Severity | Replaces | Ready |
|-----|----------|----------|-------|
| F — developer in WITH CHECK | P1 | v5.1.1 Fix C policy | ✓ |
| G — rotation SQL that respects partial unique index | P1 | v5.1.1 Fix D rotation prose | ✓ with test |
| H — iOS automatic signing split into metadata + verification token | P2 | v5.1.1 Fix A compliance check | ✓ new table + CLI |
| I — Functions-aware account-deletion applicability | P2 | v5.1.1 Fix E applicability rule | ✓ fail-closed |

v5 baseline + v5.1 Patch 3 (`__shippie/*` hard-block, unchanged)
+ v5.1.1 Fixes A/B/C/D/E (as amended by v5.1.2)
+ v5.1.2 Fixes F/G/H/I
= the implementable master spec.

The contract between the maker promise and the launch implementation is now consistent across:
- Pricing (solo Pro + org Ship to Stores)
- iOS honesty (TestFlight via Prep Kit, automatic signing verified by callback)
- Build correctness (hard-blocked collisions, correct rotation SQL)
- RLS (developers can actually write per-app signing config; roles aligned)
- Deploy history (per-version needs_secrets state)
- Compliance (static-only applicability with fail-closed Functions default)

---

## Open Questions For Next Review

Carried forward + new:

1. **Automatic-signing verification UX on non-Mac dev machines**: if a maker's only Mac is a friend's laptop, is the verify kit portable? (Recommendation: yes, the verify kit is self-contained and requires no Shippie credentials beyond the baked-in secret. Document that it can be run on any Mac with Xcode.)

2. **Functions static analyzer false positives** for legitimate stateless patterns: e.g., a Function that uses `ctx.request.body` to forward a non-identifying payload. (Recommendation: analyzer reports a specific reason; maker can annotate with `// @shippie-stateless: ${reason}` and the annotation gets logged in the deploy report for auditability. Still not a runtime override — annotations let humans read the code, they don't silence the gate.)

3. **Manual signing profile refresh**: provisioning profiles expire in 1 year. When a profile is within 30 days of expiry, do we block the submission gate or just warn? (v5.1.2 Fix H blocks on <30 days. Recommendation: keep blocking — an expired profile at submission time is a hard App Store rejection.)

4. **Verification token expiry** (90 days): is this the right balance for makers who ship infrequently? (Recommendation: yes for launch; make it configurable per org in Phase 2.)

5. **Store credentials across plan transitions**: if a solo Pro maker joins an org, their user-scoped `store_account_credentials` don't automatically migrate. (Recommendation: add a one-click "Transfer to org" action in Phase 2; for now, document the manual re-entry step.)

---

v5.1.2 = ready for real implementation.
