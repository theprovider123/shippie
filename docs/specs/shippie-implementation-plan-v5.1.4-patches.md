# Shippie v5.1.4 — Three Fixes to v5.1.3

Surgical fixes to `shippie-implementation-plan-v5.1.3-patches.md` based on Codex review (2026-04-14).

| # | Severity | v5.1.3 Issue | v5.1.4 Fix |
|---|----------|--------------|------------|
| N | P1 | Callback trusts client-supplied `signing_config_id`; a maker with kit secret can redirect a success to an arbitrary config | Bind verify kits to a `signing_config_id` at issuance and enforce `body.signing_config_id == kit.signing_config_id` server-side; also verify that config is still active |
| O | P2 | `xcodebuild clean build` without `-allowProvisioningUpdates` can fail legitimate automatic-signing setups at CLI level | Add `-allowProvisioningUpdates` to the verify kit script |
| P | P2 | In-place edits to an active `app_signing_configs` row (bypassing `rotateSigningConfig`) leave stale verifications valid | DB trigger on UPDATE invalidates verifications when signing-identity fields change; documentation flags rotation as the canonical path |

Everything else stands.

---

## Fix N — Verify kit bound to a signing_config_id at issuance, enforced server-side

### The bug
v5.1.3 Fix L's callback handler:

```typescript
const kit = await db.query.iosVerifyKits.findFirst({
  where: and(
    eq(iosVerifyKits.appId, body.app_id),
    eq(iosVerifyKits.nonce, body.nonce),
  ),
})
// ...then inserts using body.signing_config_id
```

The kit lookup uses (`app_id`, `nonce`) only. The kit is not compared against `body.signing_config_id`. Because the kit secret is baked into the downloadable bundle, a maker can:

1. Edit the baked-in `SIGNING_CONFIG_ID` constant in the verify script
2. Recompute the HMAC (they hold the secret)
3. POST a success callback that records the verification against a **different** signing config than the kit was issued for

That lets a maker verify config A on their Mac and record the success against config B (the currently active one), defeating Fix J.

The `ios_verify_kits` table already stores `signing_config_id` at issuance (from v5.1.3 Fix L schema). Fix N is enforcement.

### Fix — callback handler binds kit → config → body

```typescript
// apps/web/app/api/internal/ios-signing-verify/route.ts
export async function POST(req: Request) {
  const body = await req.json() as VerifyCallback

  // 1. Lookup kit by (app_id, nonce). Kit row carries the canonical signing_config_id.
  const kit = await db.query.iosVerifyKits.findFirst({
    where: and(
      eq(iosVerifyKits.appId, body.app_id),
      eq(iosVerifyKits.nonce, body.nonce),
    ),
  })
  if (!kit) return Response.json({ error: 'unknown kit' }, { status: 404 })
  if (kit.consumedAt) return Response.json({ error: 'kit already consumed' }, { status: 409 })
  if (kit.expiresAt < new Date()) return Response.json({ error: 'kit expired' }, { status: 410 })

  // 2. ENFORCE: body.signing_config_id MUST equal the kit's canonical value.
  //    The HMAC covers body.signing_config_id, but the HMAC secret is in the kit,
  //    so the HMAC alone does not prevent the maker from changing this field.
  //    We reject any mismatch — the maker cannot retarget the verification.
  if (body.signing_config_id !== kit.signingConfigId) {
    await recordRejection(kit, 'signing_config_id mismatch with kit')
    return Response.json({
      error: 'signing_config_id does not match the kit',
      expected: kit.signingConfigId,
      got: body.signing_config_id,
    }, { status: 403 })
  }

  // 3. The kit's signing config must still be the active one for this app + platform.
  //    If the maker rotated signing config while the kit was in flight, the verification
  //    is stale before it lands. Rotation already invalidates prior verifications in
  //    rotateSigningConfig; we also refuse the callback here so the maker gets
  //    a clear "download a new kit" signal instead of a silently-stale record.
  const activeConfig = await db.query.appSigningConfigs.findFirst({
    where: and(
      eq(appSigningConfigs.appId, body.app_id),
      eq(appSigningConfigs.platform, 'ios'),
      eq(appSigningConfigs.isActive, true),
    ),
  })
  if (!activeConfig || activeConfig.id !== kit.signingConfigId) {
    await recordRejection(kit, 'signing config is no longer active — rotate kit')
    return Response.json({
      error: 'kit is for a signing config that is no longer active; download a fresh kit',
      kit_config_id: kit.signingConfigId,
      active_config_id: activeConfig?.id ?? null,
    }, { status: 409 })
  }

  // 4. HMAC check — input now unambiguous because we've pinned every field.
  //    Note: body.signing_config_id is still part of the signed input per v5.1.3 Fix K,
  //    but we have already asserted it equals kit.signingConfigId, so no drift is possible.
  const sigInput = `${body.app_id}|${body.signing_config_id}|${body.nonce}|${body.result}|${body.log_sha256}`
  const expected = createHmac('sha256', decryptKitSecret(kit.secret))
    .update(sigInput)
    .digest('base64')
  if (!timingSafeEqualBase64(expected, body.hmac)) {
    await recordRejection(kit, 'hmac mismatch')
    return Response.json({ error: 'hmac mismatch' }, { status: 401 })
  }

  // 5. Log integrity + marker check (v5.1.3 Fix L) — unchanged
  // ...

  // 6. Commit: insert verification row using kit.signingConfigId (NOT body),
  //    so even a latent typo in the body cannot slip through.
  await db.transaction(async (tx) => {
    await tx.update(iosVerifyKits)
      .set({ consumedAt: new Date(), consumptionOutcome: 'accepted' })
      .where(eq(iosVerifyKits.id, kit.id))

    await tx.insert(iosSigningVerifications).values({
      appId: kit.appId,
      signingConfigId: kit.signingConfigId,   // <-- canonical, not body-derived
      nonce: body.nonce,
      succeededAt: body.result === 'success' ? new Date() : null,
      failedAt:    body.result === 'failure' ? new Date() : null,
      failureReason: body.result === 'failure' ? body.reason : null,
      xcodeVersion: body.xcode_version,
      macosVersion: body.macos_version,
      logR2Key: await storeLogInR2(kit.appId, logBuf),
      verifyKitVersion: kit.kitVersion,
    })
  })

  return Response.json({ ok: true, outcome: body.result })
}
```

Key changes:
1. **`body.signing_config_id !== kit.signingConfigId` → 403**: the server uses the kit's server-recorded binding as the source of truth. A mismatched body is rejected before HMAC check.
2. **Active-config recheck**: if the maker rotated between kit download and verification callback, the kit refers to a stale config. We reject with `409` and a clear message ("download a fresh kit").
3. **Insert uses `kit.signingConfigId`, not body**: even if validation logic drifts in the future, the row always records the canonical value.
4. **`recordRejection`** helper — writes `consumption_outcome='rejected'` with the reason, making rejected kits visible in the dashboard's "Verify kit history" panel. Makers who hit this repeatedly see a clear pattern.

### Why including `body.signing_config_id` in the HMAC is still correct

Even after Fix N, the HMAC still covers `body.signing_config_id`. That's deliberate:
- It prevents a man-in-the-middle from stripping or tampering with the field in transit (even though TLS already prevents this — defense in depth).
- It makes the HMAC input fully unambiguous: the server and client agree on every field. If a future refactor ever tries to derive the HMAC without this field, the mismatch surfaces quickly.

### Test cases

```
Case 1 — Maker downloads kit for config A, edits script to body.signing_config_id=B, recomputes HMAC
  → Server: body.signing_config_id mismatch with kit → 403

Case 2 — Maker downloads kit for config A, rotates to config B before running verify
  → Kit's signing_config_id is A, active config is B → 409

Case 3 — Happy path: maker downloads kit for A, runs verify, no rotation
  → body.signing_config_id == kit.signing_config_id == active.id → accepted

Case 4 — Maker runs verify kit, server receives callback, then admin rotates
  → Race: depends on commit order. If callback commits before rotation, verification
    is valid; rotation invalidates it immediately after. Readiness gate re-blocks on
    next evaluation. Acceptable.
```

---

## Fix O — `-allowProvisioningUpdates` on the verify kit xcodebuild invocation

### The gap
v5.1.3's verify kit runs:

```bash
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  clean build
```

Automatic signing in the Xcode GUI transparently fetches and refreshes provisioning profiles. The CLI does not, unless `-allowProvisioningUpdates` is explicitly passed. A machine with a valid Apple ID + Team membership that can sign fine in Xcode GUI can fail this CLI step because the profile isn't already cached locally. That's a false-negative in the verify flow — the readiness gate blocks a legitimate automatic-signing setup.

Apple documents this in `man xcodebuild`:
> `-allowProvisioningUpdates` — Allow xcodebuild to communicate with the Apple Developer website. For automatically signed targets, xcodebuild will request provisioning profiles as needed.

### Fix — add the flag

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

### Side effects to flag to makers

`-allowProvisioningUpdates` means xcodebuild may communicate with Apple's Developer API to:
- Download a profile it doesn't have locally
- Renew a profile that's expiring soon
- Register the Mac's certificate if the Apple ID is newly added

All of these are what makers expect from "automatic signing." The verify kit README should say:

> **Network required**: the verify step talks to Apple's Developer servers to fetch or refresh provisioning profiles. If you're behind a strict firewall or offline, the verify will fail. This is the same network interaction Xcode GUI performs invisibly.

### Fallback handling

If `-allowProvisioningUpdates` fails because the Apple ID is not logged into Xcode, xcodebuild emits a specific error pattern. The verify kit should surface a helpful message:

```bash
if grep -q "No Accounts" "$LOG"; then
  echo "[shippie ios-verify] Xcode has no Apple ID configured."
  echo "  Open Xcode → Settings → Accounts → Add Apple ID belonging to team $TEAM_ID"
elif grep -q "not a member of team" "$LOG"; then
  echo "[shippie ios-verify] Your Apple ID is not a member of team $TEAM_ID."
  echo "  Check Apple Developer → People; or switch DEVELOPMENT_TEAM in shippie.json"
elif grep -q "Failed to register bundle identifier" "$LOG"; then
  echo "[shippie ios-verify] Bundle ID $BUNDLE_ID is already registered to a different team."
  echo "  Choose a different bundle ID in shippie.json, or transfer the identifier in Apple Developer."
fi
```

These diagnostics short-circuit common failures without requiring the maker to read raw xcodebuild output.

### Server-side marker set

The signing markers in v5.1.3 Fix L are unchanged. Adding `-allowProvisioningUpdates` doesn't remove any marker from a successful build — it just enables the path that produces them. The `REQUIRED_SUCCESS_MARKERS` list stays the same.

---

## Fix P — Invalidate verifications on in-place edits to signing identity fields

### The gap
v5.1.3 Fix J invalidates verifications inside `rotateSigningConfig`. That covers the intended code path. But if some future admin page, CLI command, or a migration script updates `ios_team_id`, `ios_bundle_id`, or `ios_signing_mode` **in place** on the active row, the prior verifications remain valid because `rotateSigningConfig` didn't run. The compliance gate passes based on a verification that no longer corresponds to the live config.

The fix needs two layers:
1. A DB trigger that invalidates verifications whenever signing-identity fields change on an `app_signing_configs` row — bypass-proof, since triggers fire regardless of the code path
2. A documented policy preference: rotation is the canonical update path; in-place edits work but always invalidate

### Fix — database trigger

```sql
-- Invalidate iOS verifications whenever any signing-identity field changes
-- on an app_signing_configs row. The set of fields is the union of "things that
-- affect what Xcode signs with" — team, bundle ID, signing mode, cert reference,
-- profile reference, entitlements.
create or replace function invalidate_verifications_on_config_change()
returns trigger as $$
begin
  if NEW.platform <> 'ios' then
    return NEW;
  end if;

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
           invalidated_reason = format(
             'signing config %s updated in place: changed fields detected on row version %s',
             NEW.id, NEW.version
           )
     where signing_config_id = NEW.id
       and invalidated_at is null;
  end if;

  return NEW;
end $$ language plpgsql;

drop trigger if exists app_signing_configs_invalidate_verifications on app_signing_configs;
create trigger app_signing_configs_invalidate_verifications
  after update on app_signing_configs
  for each row execute function invalidate_verifications_on_config_change();
```

Key notes:
- `is distinct from` correctly handles NULL vs NULL (treating them as equal) and NULL vs value (treating them as distinct). Plain `<>` would treat both sides NULL as "unknown" and the trigger would not fire.
- `coalesce(..., '')` makes the comparison explicit against a canonical empty — redundant with `is distinct from` but removes ambiguity from code review.
- Trigger runs `after update` so it never rolls back the update itself — invalidation is additive.
- The trigger does NOT fire on `is_active` changes (that's rotation, handled by the application-level flow in v5.1.3 Fix J). It only fires when signing-identity fields change.

### Rotation interaction

`rotateSigningConfig` no longer needs the application-level invalidation step from v5.1.3 Fix J — the trigger handles it automatically because rotation creates a new row (inserts don't fire this trigger) and then flips `is_active` on the old row (which doesn't change any identity field, so no invalidation is triggered on the old row).

Wait — that's wrong. In the rotation flow, the new row has different identity fields, so we need to invalidate **verifications on the old row**. But the trigger above fires per-row on UPDATE, and the old row's identity fields aren't changing. The trigger won't catch rotation.

Fix: keep the application-level invalidation in `rotateSigningConfig` **and** add the trigger for in-place edits. They cover different cases:

| Change type | Trigger catches? | App-level catches? |
|---|---|---|
| Rotation (new row, old row deactivated) | No (old row's fields unchanged) | Yes (rotateSigningConfig explicitly invalidates) |
| In-place edit of active row's identity fields | Yes | No (bypasses rotateSigningConfig) |
| In-place edit of `is_active` alone (not rotation) | No | N/A |

So we need both. The application-level invalidation in v5.1.3 Fix J stays. The trigger is additional coverage for the bypass case.

### Rotation helper — unchanged from v5.1.3

```typescript
// lib/stores/signing.ts (unchanged)
export async function rotateSigningConfig(...) {
  return db.transaction(async (tx) => {
    // 1. Insert new row as inactive
    // 2. Atomic flip
    // 3. Invalidate prior verifications (app-level)
    if (platform === 'ios') {
      await tx.update(iosSigningVerifications)
        .set({ invalidatedAt: new Date(), ... })
        .where(...)
    }
    return ...
  })
}
```

### Policy doc — add to `docs/security.md`

> ## Signing config updates
>
> Shippie enforces a single canonical path for changing iOS signing identity: `rotateSigningConfig`. This helper creates a new `app_signing_configs` row, atomically flips it to active, and invalidates any iOS verifications tied to prior rows. This is the recommended and tested flow.
>
> In-place edits to an active signing config are supported by the schema (not disallowed at the application level) but will automatically invalidate any verifications for that config row via the `app_signing_configs_invalidate_verifications` database trigger. After an in-place edit, the readiness gate will reflect the invalidation on the next evaluation and require the maker to re-run `shippie ios-verify`.
>
> Admin tools that edit signing configs must never bypass RLS or issue raw `UPDATE` statements against `ios_signing_verifications.invalidated_at` to "undo" the trigger. Any such tool is a security bypass and should be reviewed as a critical incident.

### Integration tests

```sql
-- 0006_v514_patches.test.sql
do $$
declare
  app_id uuid := gen_random_uuid();
  config_id uuid;
  verification_id uuid;
  invalidated timestamptz;
begin
  insert into apps (id, slug, name, type, category, source_type, maker_id)
    values (app_id, 'test', 'Test', 'app', 'tools', 'zip', gen_random_uuid());

  -- Create active config
  insert into app_signing_configs (
    id, app_id, platform, is_active, version,
    ios_team_id, ios_bundle_id, ios_signing_mode
  ) values (
    gen_random_uuid(), app_id, 'ios', true, 1,
    'ABCD1234EF', 'app.shippie.test', 'automatic'
  ) returning id into config_id;

  -- Record a verification
  insert into ios_signing_verifications (
    id, app_id, signing_config_id, nonce, succeeded_at, verify_kit_version
  ) values (
    gen_random_uuid(), app_id, config_id, 'nonce-1', now(), 1
  ) returning id into verification_id;

  -- In-place edit: change team ID
  update app_signing_configs
     set ios_team_id = 'XYZ1234567'
   where id = config_id;

  -- Trigger should have invalidated the verification
  select invalidated_at into invalidated
    from ios_signing_verifications
    where id = verification_id;
  assert invalidated is not null, 'Expected trigger to invalidate verification';

  -- In-place edit of a non-signing field (e.g., is_active flip) should NOT invalidate
  insert into ios_signing_verifications (
    id, app_id, signing_config_id, nonce, succeeded_at, verify_kit_version
  ) values (
    gen_random_uuid(), app_id, config_id, 'nonce-2', now(), 1
  ) returning id into verification_id;

  update app_signing_configs
     set is_active = true  -- no-op but still an UPDATE
   where id = config_id;

  select invalidated_at into invalidated
    from ios_signing_verifications
    where id = verification_id;
  assert invalidated is null, 'Trigger should not invalidate on is_active-only change';
end $$;
```

---

## Migration Ordering

```
0003_v51_patches.sql     (v5.1 base)
0004_v511_patches.sql    (v5.1.1)
0005_v512_patches.sql    (v5.1.2 + v5.1.3 amendments)
0006_v514_patches.sql    (v5.1.4 — THIS patch)
```

`0006_v514_patches.sql` contents:

1. No DDL for Fix N — the enforcement is in the callback handler (`apps/web/app/api/internal/ios-signing-verify/route.ts`). Tests added to `lib/stores/verify-callback.test.ts`.
2. No DDL for Fix O — verify kit template change (`lib/stores/verify-kit-template.ts`).
3. `create or replace function invalidate_verifications_on_config_change()` (Fix P)
4. `drop trigger if exists + create trigger app_signing_configs_invalidate_verifications` (Fix P)

Tests:
- `lib/stores/verify-callback.test.ts` — 4 cases from Fix N
- `0006_v514_patches.test.sql` — trigger assertion for Fix P (shown above)
- `lib/stores/verify-kit-template.test.ts` — ensures `-allowProvisioningUpdates` is present and well-placed

---

## Summary

| Fix | Severity | Ready |
|-----|----------|-------|
| N — verify callback binds kit → config → body server-side | P1 | ✓ handler + tests |
| O — `-allowProvisioningUpdates` on verify xcodebuild | P2 | ✓ kit template |
| P — trigger invalidates verifications on in-place signing-identity edits | P2 | ✓ trigger + test |

v5 baseline
+ v5.1 Patch 3
+ v5.1.1 A/B/C/D/E
+ v5.1.2 F/G
+ v5.1.3 J/K/L/M
+ v5.1.4 N/O/P
= the implementable master spec.

After v5.1.4 the iOS verification flow is:
- **Bound to the active signing config** at query time (Fix J)
- **Runs a real signed build** that exercises cert + profile resolution (Fix K)
- **Log-marker verified** server-side, not just HMAC possession (Fix L)
- **`needs_action` persists cleanly** in the DB with aligned UI contract (Fix M)
- **Callback server binds body to the kit's canonical config** — maker cannot retarget (Fix N)
- **Uses `-allowProvisioningUpdates`** so legitimate CLI automatic-signing setups don't false-fail (Fix O)
- **Invalidated automatically** when anyone edits signing identity in place (Fix P)

No code path in the compliance/signing pipeline now depends on maker honesty or client-side field choice.

---

## Open Questions

1. **Fix N race**: between kit download and callback, a rotation can happen. We reject with 409, but a maker who's actively rotating and verifying in parallel could hit a rejection loop. (Recommendation: UI disables "Download verify kit" button for 60s after a rotation, with a clear "wait for rotation to settle" message.)

2. **Fix O**: `-allowProvisioningUpdates` on some corporate networks hits Apple's servers via a proxy that strips headers. Should we offer an offline mode with manual profile upload as fallback? (Recommendation: no for launch; document the requirement in the verify kit README and escalate via support if a real customer hits it.)

3. **Fix P trigger granularity**: should the trigger also invalidate on changes to `account_credential_id`? Strictly that only changes the upload credential, not the signing identity, so it shouldn't matter for TestFlight-capable signing. But it does affect where the IPA ends up. (Recommendation: no — account credential swaps are upload-only and don't invalidate what's already been proven about signing.)

4. **Future: revocation cascade**: when a cert is revoked in Apple Developer, nothing in Shippie currently detects it. The next Ship to Stores attempt fails at upload time. Should we poll the Apple API? (Recommendation: Phase 2 — add a daily cron that checks cert validity via ASC API for active configs with registered account credentials.)

5. **Fix N audit**: rejected callbacks (mismatch, stale) should be surfaced in the dashboard's "Verify history" panel so makers see why their verify didn't register. (Recommendation: yes — use `consumption_outcome` and the stored rejection reason.)
