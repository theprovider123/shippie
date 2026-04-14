# Shippie v5.1.5 — Three Fixes to v5.1.4

Surgical fixes to `shippie-implementation-plan-v5.1.4-patches.md` based on Codex review (2026-04-14).

| # | Severity | v5.1.4 Issue | v5.1.5 Fix |
|---|----------|--------------|------------|
| Q | P1 | Active-config check happens before the insert transaction — rotation committed in between can leave a stale verification for a now-inactive config | Check + insert in one transaction, guarded by `SELECT ... FOR UPDATE` on the kit's signing config row so rotation blocks behind it |
| R | P2 | `recordRejection` doesn't state it sets `consumed_at`, so rejected kits have ambiguous one-time semantics and could be replayed | Explicit contract: `recordRejection` atomically sets both `consumed_at` and `consumption_outcome='rejected'` in one UPDATE |
| S | P2 | Summary claim "no code path depends on maker honesty" overstates what the mechanism proves; conflicts with honest framing elsewhere in the spec | Rewrite the summary to match the Fix L framing: guided self-attestation with strong audit trail, bounded by the fact that forged passes still fail at real submission |

Everything else in v5 / v5.1 Patch 3 / v5.1.1 A–E / v5.1.2 F/G / v5.1.3 J/K/L/M / v5.1.4 N/O/P stands.

---

## Fix Q — Race-free active-config check via row lock

### The bug
v5.1.4 Fix N's handler:

```typescript
// Step 3 (outside any transaction)
const activeConfig = await db.query.appSigningConfigs.findFirst({
  where: and(
    eq(appSigningConfigs.appId, body.app_id),
    eq(appSigningConfigs.platform, 'ios'),
    eq(appSigningConfigs.isActive, true),
  ),
})
if (!activeConfig || activeConfig.id !== kit.signingConfigId) {
  // reject
}

// ... HMAC check ...

// Step 6 — insert transaction
await db.transaction(async (tx) => {
  await tx.update(iosVerifyKits).set(...)
  await tx.insert(iosSigningVerifications).values({
    signingConfigId: kit.signingConfigId,
    ...
  })
})
```

Between step 3 and step 6, another session can commit a rotation:
1. v5.1.4 active-check reads: config A is active, kit is for A → passes
2. HMAC check runs
3. Rotation starts: inserts B inactive, flips A→inactive / B→active, invalidates verifications for A
4. Rotation commits
5. v5.1.4 insert transaction commits with a fresh verification row for A

The fresh row was inserted *after* rotation's invalidation step, so rotation doesn't catch it. The result: a non-invalidated verification exists for an inactive signing config. The readiness gate accepts it (Fix J filters on `invalidated_at IS NULL` but our row has no invalidation).

### Fix — lock the signing config row inside the insert transaction

```typescript
// apps/web/app/api/internal/ios-signing-verify/route.ts
export async function POST(req: Request) {
  const body = await req.json() as VerifyCallback

  // Steps 1-2: kit lookup + body/kit binding (v5.1.4 Fix N) — unchanged
  const kit = await db.query.iosVerifyKits.findFirst({ where: ... })
  if (!kit) return Response.json({ error: 'unknown kit' }, { status: 404 })
  if (kit.consumedAt) return Response.json({ error: 'kit already consumed' }, { status: 409 })
  if (kit.expiresAt < new Date()) return Response.json({ error: 'kit expired' }, { status: 410 })
  if (body.signing_config_id !== kit.signingConfigId) {
    await recordRejection(kit, 'signing_config_id mismatch with kit')
    return Response.json({ error: 'signing_config_id does not match the kit' }, { status: 403 })
  }

  // Step 3: HMAC + log integrity checks (v5.1.3 Fix L, v5.1.4) — unchanged
  if (!verifyHmac(body, decryptKitSecret(kit.secret))) {
    await recordRejection(kit, 'hmac mismatch')
    return Response.json({ error: 'hmac mismatch' }, { status: 401 })
  }
  const logBuf = await validateLogIntegrity(body)
  if (!logHasRequiredMarkers(logBuf, body.result)) {
    await recordRejection(kit, 'log missing required signing markers')
    return Response.json({ error: 'log does not contain required signing markers' }, { status: 400 })
  }

  // Step 4: Active-config check AND verification insert in ONE transaction, guarded by a row lock.
  try {
    await db.transaction(async (tx) => {
      // Lock the kit's signing config row FOR UPDATE. Any concurrent rotation that
      // targets this row (rotation's atomic flip updates every row matching the
      // (app_id, platform) predicate, including ours) will block here until we commit.
      const [locked] = await tx.execute<{ id: string; is_active: boolean }>(sql`
        select id, is_active
          from app_signing_configs
         where id = ${kit.signingConfigId}
           for update
      `)

      if (!locked) {
        throw new VerifyError(410, 'signing config no longer exists')
      }
      if (!locked.is_active) {
        throw new VerifyError(409, 'signing config is no longer active; download a fresh kit')
      }
      // The partial unique index on (app_id, platform) where is_active = true guarantees
      // that if our locked row is active, it IS the unique active config for this
      // (app, platform). No second query needed.

      // Consume the kit — sets consumed_at + outcome='accepted' atomically
      await tx.update(iosVerifyKits)
        .set({
          consumedAt: sql`now()`,
          consumptionOutcome: 'accepted',
        })
        .where(eq(iosVerifyKits.id, kit.id))

      // Insert verification using the canonical signing_config_id (kit's, not body's)
      await tx.insert(iosSigningVerifications).values({
        appId: kit.appId,
        signingConfigId: kit.signingConfigId,
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
      await recordRejection(kit, err.message)
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  return Response.json({ ok: true, outcome: body.result })
}
```

### Why this closes the race

**Rotation's transaction** (from v5.1.3 Fix G rotation helper) does:
```sql
-- Within rotateSigningConfig transaction
INSERT INTO app_signing_configs (..., is_active=false) -- inactive new row
UPDATE app_signing_configs
   SET is_active = (id = $new_id)
 WHERE app_id = $app_id AND platform = $platform
   AND (id = $new_id OR is_active = true);          -- touches our kit's row
```

The rotation's UPDATE touches every active-or-becoming-active row for the (app, platform). If our callback has already acquired a `FOR UPDATE` lock on `app_signing_configs WHERE id = kit.signing_config_id`, rotation's UPDATE blocks at this row until our transaction commits.

**Ordering:**
1. Callback transaction opens, acquires `FOR UPDATE` lock on kit's config row
2. Rotation transaction starts, inserts new row inactive (no conflict), then issues UPDATE
3. Rotation's UPDATE blocks waiting for our lock
4. Callback inserts verification and commits, releasing the lock
5. Rotation's UPDATE proceeds, flipping our kit's config to inactive
6. Rotation's Fix J app-level invalidation runs, catching the fresh verification we just inserted, marking it `invalidated_at = now()`
7. Rotation commits

**Result**: the new verification row exists briefly but is immediately invalidated by rotation's invalidation step. Readiness gate (which filters on `invalidated_at IS NULL`) rejects it on next evaluation. The maker sees "re-verify" instead of a stale pass.

**Alternative ordering:**
1. Rotation transaction runs first, commits, invalidates all prior verifications
2. Callback transaction acquires lock, sees `is_active = false` on kit's config → throws `VerifyError(409)`
3. Kit is rejected with `consumed_at` set (Fix R), cannot be replayed

Either way, there is no window where a stale verification survives.

### Why `SELECT ... FOR UPDATE` is the right primitive

- **`FOR UPDATE`** acquires a row-level exclusive lock that blocks other writers until commit. Rotation's UPDATE is a writer — blocked.
- **`FOR NO KEY UPDATE`** would suffice for non-unique-key columns, but `is_active` participates in the partial unique index, so use `FOR UPDATE` to be explicit.
- Readers (plain SELECTs) are unaffected — the dashboard can still query config state concurrently.

### Transaction isolation

The default `read committed` isolation level is sufficient given the explicit lock. We do not need `serializable` — the lock guarantees the check and insert see the same row state, and the partial unique index guarantees uniqueness.

### Test cases

```
Case 1 — Callback runs with no concurrent rotation
  → Lock acquired, is_active=true, verification inserted, committed
  → Readiness gate passes

Case 2 — Rotation already committed before callback starts
  → Lock acquired, is_active=false → VerifyError(409)
  → Kit rejected (Fix R), maker sees "download fresh kit"

Case 3 — Rotation starts after callback starts
  → Rotation's UPDATE blocks on our FOR UPDATE lock
  → Callback commits, rotation proceeds, rotation's invalidation catches our row
  → Readiness gate filters out invalidated → blocks, maker prompted to re-verify

Case 4 — Two callbacks race (duplicate kit — shouldn't happen but defense in depth)
  → First callback locks, commits, sets kit consumed
  → Second callback reads kit.consumed_at → 409 before acquiring lock
```

### Parallel invalidation path (v5.1.4 Fix P trigger) still applies

The DB trigger from v5.1.4 Fix P fires on UPDATE to `app_signing_configs` when signing-identity fields change. Rotation's UPDATE only changes `is_active`, so the trigger does **not** fire on rotation (correct, since rotation handles invalidation at the app level). In-place edits to `ios_team_id`/`ios_bundle_id`/etc. still fire the trigger and invalidate fresh verifications automatically. Both paths coexist.

---

## Fix R — Rejected kits are atomically consumed

### The gap
v5.1.4 says rejection paths call `recordRejection(kit, reason)` and write `consumption_outcome='rejected'`, but never states that `consumed_at` is set. If `recordRejection` only touches `consumption_outcome`, the kit's one-time semantics break: `consumed_at IS NULL` means the kit can be replayed indefinitely, generating noise and (more importantly) opening a retry window where a maker can edit the script and try again without downloading a fresh kit.

### Fix — explicit contract for `recordRejection`

```typescript
// apps/web/lib/stores/verify-kit.ts
/**
 * Consume a verify kit as rejected. Sets consumed_at AND consumption_outcome
 * atomically so the kit can never be replayed, regardless of why it was rejected.
 *
 * Rejection reasons are persisted for the maker-facing "Verify history" panel
 * and for security auditing of repeated rejection patterns.
 */
export async function recordRejection(
  kit: IosVerifyKit,
  reason: string,
): Promise<void> {
  await db.update(iosVerifyKits)
    .set({
      consumedAt: sql`now()`,
      consumptionOutcome: 'rejected',
      rejectionReason: reason,
    })
    .where(and(
      eq(iosVerifyKits.id, kit.id),
      isNull(iosVerifyKits.consumedAt),      // idempotent: no-op if already consumed
    ))
}
```

Two key properties:
1. **Atomic**: a single UPDATE sets all three fields (`consumed_at`, `consumption_outcome`, `rejection_reason`) in one row version — no partial state visible.
2. **Idempotent**: the `consumedAt IS NULL` guard means calling `recordRejection` twice on the same kit is safe. The second call is a no-op, which matters because some rejection paths log-then-reject-then-throw and retries from caller code (e.g., on DB conflict recovery) shouldn't double-consume.

### Schema change — add `rejection_reason` column

```sql
alter table ios_verify_kits
  add column rejection_reason text;

comment on column ios_verify_kits.rejection_reason is
  'Human-readable reason the kit was consumed as rejected. Null when consumption_outcome is accepted or the kit is not yet consumed.';
```

### Kit state transitions (updated)

```
issued (consumed_at=null)
  ↓
  ├─ accepted (consumed_at=now(), consumption_outcome='accepted', rejection_reason=null)
  └─ rejected (consumed_at=now(), consumption_outcome='rejected', rejection_reason='<explanation>')

  (expired — read-only; consumed_at remains null, expires_at < now())
```

Expired kits are never "consumed" — they time out. The handler already rejects with 410 on `expires_at < now()`. We could add a sweeper that sets `consumption_outcome='expired'` for dashboard clarity, but that's cosmetic.

### Dashboard surface

The maker-facing "Verify history" panel renders:

```
Kit e1f2… — 2026-04-14 11:02
  Status: rejected
  Reason: signing_config_id mismatch with kit
  Apple ID: steve@example.com
  Xcode: 15.2
  [Download fresh kit]

Kit c9a3… — 2026-04-14 10:48
  Status: accepted
  Verified: 2026-04-14 10:49 UTC
  Expires: 2026-07-13 UTC
```

Repeated rejections on the same app with the same reason trigger a soft-warn in the admin moderation queue: "Maker X has 5+ rejected verify kits in 24h — investigate for tampering."

### Test coverage

```sql
-- 0007_v515_patches.test.sql
do $$
declare
  kit_id uuid;
  consumed_at_val timestamptz;
begin
  insert into ios_verify_kits (id, app_id, signing_config_id, nonce, secret,
                                kit_version, issued_to, expires_at)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'nonce-x',
            'encrypted', 1, gen_random_uuid(), now() + interval '7 days')
    returning id into kit_id;

  -- First rejection: sets everything
  update ios_verify_kits
     set consumed_at = now(),
         consumption_outcome = 'rejected',
         rejection_reason = 'hmac mismatch'
   where id = kit_id
     and consumed_at is null;

  select consumed_at into consumed_at_val from ios_verify_kits where id = kit_id;
  assert consumed_at_val is not null, 'consumed_at must be set';

  -- Second call — idempotent no-op
  update ios_verify_kits
     set consumed_at = now() + interval '1 minute',
         consumption_outcome = 'rejected',
         rejection_reason = 'second call should not overwrite'
   where id = kit_id
     and consumed_at is null;   -- guard excludes already-consumed rows

  assert (select rejection_reason from ios_verify_kits where id = kit_id) = 'hmac mismatch',
         'second call must not overwrite first rejection reason';
end $$;
```

---

## Fix S — Honest summary language

### The overstatement
v5.1.4's closing summary says:

> "No code path in the compliance/signing pipeline now depends on maker honesty or client-side field choice."

That's true for **client-side field choice** (Fix N binds the callback body to the kit's canonical fields). It's **not** fully true for **maker honesty**: a determined maker can still:

- Modify the verify script to run a signed build of a different project and submit that log
- Run the real verify against a working project, then rotate signing-identity fields after the fact (triggered by Fix P, so this at least invalidates)
- Build a parallel binary with the same signing markers in its log output by mimicking Xcode's output format

These are all deliberate fraud scenarios. The mechanism makes casual and accidental passes impossible, and it records a tamper-evident audit trail. It does not defeat a determined maker — **and the real App Store submission still catches them**, because Apple's review will reject a non-matching bundle regardless of what Shippie's verify step said.

### Fix — replace the v5.1.4 summary section

**Old**:
> "After v5.1.4 the iOS verification flow is [...] No code path in the compliance/signing pipeline now depends on maker honesty or client-side field choice."

**New**:
> "After v5.1.4 the iOS verification flow is:
>
> - **Bound to the active signing config** at query time (Fix J)
> - **Runs a real signed build** that exercises cert + profile resolution with provisioning updates enabled (Fix K + Fix O)
> - **Log-marker verified** server-side, not just HMAC possession (Fix L)
> - **`needs_action` persists cleanly** in the DB with aligned UI contract (Fix M)
> - **Callback server binds body to the kit's canonical config** — maker cannot retarget the verification via client-side edits (Fix N)
> - **Invalidated automatically** when anyone edits signing identity in place (Fix P)
>
> **What this proves**: the flow enforces that every verification was issued to a specific active signing config, was returned within the kit's one-time lifecycle, and was accompanied by an xcodebuild log containing the real signing markers. Client-side field tampering is blocked server-side.
>
> **What this does not prove**: that the signed build the maker ran was actually of this app's code. A determined maker can run a real signed build of a decoy project and submit that log. The mechanism is guided self-attestation with a strong audit trail, not cryptographic proof of intent. The practical backstop is that real App Store submission will catch any mismatch — Apple's review will reject a bundle that doesn't actually build or sign in the claimed state.
>
> The gate is designed to make **accidental and casual passes impossible** and to **produce a forensic audit trail for deliberate fraud**, not to defeat a determined adversary. Makers who cheat here will fail at real submission regardless of what the gate says, and the audit trail makes that failure investigable."

### Also — update the mid-patch framing in v5.1.3 Fix L

v5.1.3 Fix L already has the correct framing ("Reframe as guided self-attestation with audit trail"), but v5.1.4's summary walked it back. Fix S restores consistency — the summary now matches the earlier careful framing.

### Where this language lives in the product

- **Security docs** (`docs/security.md`): full honest framing as above
- **Dashboard "Learn how we verify" modal**: short version — "We verify that your Mac can produce a signed iOS build of an app matching your configured team and bundle ID. The check is strong enough to catch mistakes but depends on real App Store review as the final backstop."
- **Review / compliance statements** (for business customers asking about SOC2 prep): full disclosure that iOS verification is self-attested + log-audited, with reference to the audit trail mechanisms.

---

## Migration Ordering

```
0003_v51_patches.sql     (v5.1 base)
0004_v511_patches.sql    (v5.1.1)
0005_v512_patches.sql    (v5.1.2 + v5.1.3 amendments)
0006_v514_patches.sql    (v5.1.4)
0007_v515_patches.sql    (v5.1.5 — THIS patch)
```

`0007_v515_patches.sql` contents:

1. `alter table ios_verify_kits add column rejection_reason text` (Fix R)
2. Optional `comment on column` for documentation (Fix R)
3. No DDL for Fix Q — it's handler transaction logic (`apps/web/app/api/internal/ios-signing-verify/route.ts`)
4. No DDL for Fix S — it's documentation / summary framing

Tests:
- `lib/stores/verify-callback.test.ts` — add 4 cases from Fix Q (row lock race matrix)
- `lib/stores/verify-kit.test.ts` — add idempotency test from Fix R
- `0007_v515_patches.test.sql` — schema assertion that `rejection_reason` exists

---

## Summary

| Fix | Severity | Ready |
|-----|----------|-------|
| Q — `SELECT ... FOR UPDATE` guards the callback insert transaction against rotation race | P1 | ✓ handler + test matrix |
| R — `recordRejection` is atomic (consumed_at + outcome + reason in one UPDATE, idempotent guard) | P2 | ✓ schema + helper + test |
| S — honest summary language matches Fix L framing | P2 | ✓ docs update |

v5 baseline
+ v5.1 Patch 3
+ v5.1.1 A/B/C/D/E
+ v5.1.2 F/G
+ v5.1.3 J/K/L/M
+ v5.1.4 N/O/P
+ v5.1.5 Q/R/S
= the implementable master spec.

### What the final iOS verification gate actually guarantees

1. A verification is recorded only when the kit, config, and active state all agree at the moment of insert (Fix Q row lock).
2. Every rejected or accepted kit is one-shot — no replay (Fix R atomic consumption).
3. The verification is bound to a specific signing config row and cannot be retargeted by a client (Fix N).
4. Any change to the config's signing-identity fields invalidates the verification automatically (Fix P trigger).
5. Rotation invalidates all prior verifications for the rotated-away-from config (v5.1.3 Fix J app-level + Fix Q interleaving).
6. The xcodebuild run that produced the log actually exercised signing, provisioning profile resolution, and produced known signing markers (Fix K + Fix L + Fix O).
7. The mechanism is honestly framed as guided self-attestation bounded by real App Store review, not cryptographic proof (Fix S).

### Open Questions (carried forward + new)

1. **Fix Q lock duration**: the `FOR UPDATE` lock is held for the entire insert transaction — a few tens of milliseconds in practice. If rotation is a very common operation (it shouldn't be), we might see brief blocking. (Recommendation: monitor rotation frequency; if it's ever >10/minute for one app, escalate.)

2. **Fix R retention**: rejected kit rows accumulate in `ios_verify_kits`. Should we purge them after N days? (Recommendation: 180 days retention for audit trail, then archive to cold storage; never hard-delete because they're forensic records.)

3. **Fix S trust tier**: business customers requiring SOC2 evidence will want to know exactly what the verification mechanism guarantees. We should produce a one-page "iOS verification threat model and guarantees" document for inclusion in DPA / security review packets. (Recommendation: yes, Phase 2 alongside SOC2 Type I prep.)

4. **Carried forward from v5.1.4**:
   - Rotation-vs-verify race mitigation (still recommend UI cooldown)
   - Offline signing fallback (no change — still not for launch)
   - Apple cert revocation detection (Phase 2 cron)
   - Rejected-callback audit UI (now trivially available since Fix R persists reasons)

---

v5.1.5 ships the last material correctness issue in the iOS verification pipeline. The trust model is now **stated honestly and implemented without races or replay windows**. The compliance gate does not depend on maker honesty for the mechanics of the check, but it also does not pretend to prove what it cannot prove — and it is backed by the hard reality of Apple's own review as the final catch.
