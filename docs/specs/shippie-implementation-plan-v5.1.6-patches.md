# Shippie v5.1.6 — One Fix to v5.1.5

Final acceptance-path fix based on Codex review (2026-04-14).

| # | Severity | v5.1.5 Issue | v5.1.6 Fix |
|---|----------|--------------|------------|
| T | P1 | Acceptance path's kit UPDATE has no `consumed_at IS NULL` guard — duplicate concurrent valid callbacks can each insert a fresh verification row, breaking the one-shot guarantee under races | Atomic consume-if-unconsumed in the same transaction: conditional UPDATE + `rowCount` check + abort if zero |

Everything in v5 / v5.1 Patch 3 / v5.1.1 A–E / v5.1.2 F/G / v5.1.3 J–M / v5.1.4 N–P / v5.1.5 Q/R/S stands.

---

## Fix T — Acceptance path is atomically one-shot

### The bug
v5.1.5's acceptance path inside the callback transaction:

```typescript
await tx.update(iosVerifyKits)
  .set({
    consumedAt: sql`now()`,
    consumptionOutcome: 'accepted',
  })
  .where(eq(iosVerifyKits.id, kit.id))       // <-- no consumed_at IS NULL guard
```

The pre-transaction `if (kit.consumedAt)` guard reads committed state at load time — before our transaction opens. It is not a consistency barrier against concurrent transactions. If two valid callbacks for the same kit arrive within the same brief window, this sequence can occur:

1. Callback A: reads kit → `consumed_at = null` → passes pre-check
2. Callback B: reads kit → `consumed_at = null` → passes pre-check (both reads committed-snapshot the same state)
3. Callback A: opens transaction, acquires config row lock, UPDATE kit (unconditional), INSERT verification row #1, commits → kit is now `consumed_at = now(), outcome = accepted`
4. Callback B: opens transaction, waits on config row lock, acquires it when A commits, UPDATE kit (unconditional — overwrites A's consumed_at with its own now()), INSERT verification row #2, commits → two verifications, one kit

The rotation-race test matrix from Fix Q didn't surface this because the test only considered one callback per kit. Fix R closed the rejection-path replay but not the acceptance path — the rejection path's guard `AND consumedAt IS NULL` is the pattern that Fix T extends to acceptance.

### Fix — atomic consume-if-unconsumed inside the transaction

```typescript
// apps/web/app/api/internal/ios-signing-verify/route.ts
try {
  await db.transaction(async (tx) => {
    // Fix Q — row lock on signing config (unchanged)
    const [locked] = await tx.execute<{ id: string; is_active: boolean }>(sql`
      select id, is_active
        from app_signing_configs
       where id = ${kit.signingConfigId}
         for update
    `)
    if (!locked) throw new VerifyError(410, 'signing config no longer exists')
    if (!locked.is_active) throw new VerifyError(409, 'signing config is no longer active; download a fresh kit')

    // Fix T — atomic consume-if-unconsumed.
    // Returns the number of rows actually updated. If zero, someone else
    // already consumed the kit between our pre-check and this transaction.
    const consumed = await tx.update(iosVerifyKits)
      .set({
        consumedAt: sql`now()`,
        consumptionOutcome: 'accepted',
      })
      .where(and(
        eq(iosVerifyKits.id, kit.id),
        isNull(iosVerifyKits.consumedAt),      // <-- the guard
      ))
      .returning({ id: iosVerifyKits.id })

    if (consumed.length === 0) {
      // Kit was consumed by a concurrent callback. Abort this transaction.
      // Do NOT call recordRejection here — the kit is already consumed
      // (possibly as 'accepted' by the winning race, or 'rejected' by its
      // own reason). Overwriting its state would erase the winning record.
      throw new VerifyError(409, 'kit already consumed by a concurrent callback')
    }

    // Only the winning callback reaches here. Insert the verification.
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
    // IMPORTANT: only call recordRejection for errors that did NOT consume the kit.
    // If we aborted due to "already consumed by concurrent callback", the kit is
    // already in its final state — do not touch it.
    if (err.status !== 409 || !err.message.includes('already consumed by a concurrent callback')) {
      await recordRejection(kit, err.message)
    }
    return Response.json({ error: err.message }, { status: err.status })
  }
  throw err
}
```

### Why `RETURNING` + `length` check

Drizzle's `.update(...).set(...).where(...).returning(...)` returns an array of the updated rows. Length zero means the `WHERE` clause matched no rows — i.e., the guard `isNull(consumedAt)` failed, meaning the kit was consumed after we loaded it but before our UPDATE.

Postgres's plain UPDATE returns affected-row count in `RESULT` (or `ROW_COUNT` depending on driver), but `RETURNING` is the portable way to get the count across drivers and gives us the row ids we'd need for logging. Drizzle's type inference also plays nicely with `RETURNING`.

Alternative: use `tx.execute` with a raw `UPDATE ... WHERE ... RETURNING id` and inspect `rows.length`. Equivalent.

### Why we don't call `recordRejection` on the "already consumed by concurrent callback" path

This is subtle. The kit is already in its final state, written by the winning transaction. It might be `consumption_outcome = 'accepted'` (happy path: the other callback won) or `consumption_outcome = 'rejected'` (if the other callback hit HMAC failure etc. — but that path already called `recordRejection` before the transaction). In either case, overwriting `rejection_reason` with "kit already consumed by a concurrent callback" would erase the real final state.

The losing callback simply returns 409 to the caller. No kit state change. No logging into the dashboard's Verify history under this row — the kit row already has its canonical outcome.

### Interaction with rotation race (Fix Q) — still sound

Fix Q's row lock on `app_signing_configs` serializes callbacks that touch the same config row. Two callbacks for the same kit both target the same signing config (because `kit.signing_config_id` is the same), so they serialize on the same lock.

- **Callback A** enters transaction, acquires lock on config row
- **Callback B** enters transaction, waits on the same lock
- **A** does conditional consume → succeeds (guard passes, returns 1 row), inserts verification, commits
- **B** acquires lock (now released by A), re-reads `app_signing_configs.is_active` — still true, passes. Does conditional consume → returns 0 rows because A already set `consumed_at`. Throws 409.

No second verification row is inserted. The one-shot guarantee holds under this duplicated-callback scenario.

### Interaction with rotation happening between A and B

- **A** enters transaction, acquires lock, consume succeeds, insert happens, commits
- **Rotation** starts, inserts new config row inactive, issues UPDATE to flip (blocks on... no, nothing is holding the lock anymore since A committed)
- **Rotation** proceeds: flips is_active on A's config to false, commits, rotation's app-level invalidation catches A's verification and marks it invalidated
- **B** acquires lock, reads is_active=false on A's old config, throws 409 at the "signing config no longer active" check (Fix Q)

B never reaches the conditional consume step. Correct outcome: A's verification exists but was invalidated by rotation's invalidation step. B is rejected. Readiness gate reflects invalidation on next evaluation.

### Test cases (extend Fix Q's matrix)

```
Case 1 — Single callback (baseline)
  → Consumed = 1 row, verification inserted, returns 200

Case 2 — Two concurrent callbacks for the same kit, no rotation
  → Both acquire config row lock in sequence
  → First: consumed = 1, inserts verification, commits
  → Second: consumed = 0, throws 409 "already consumed by concurrent callback"
  → Only one verification row exists
  → Kit row has exactly one consumed_at set (by the first callback)

Case 3 — Two concurrent callbacks, rotation interleaves
  → A acquires lock, commits verification
  → Rotation starts, invalidates A's verification, commits
  → B acquires lock, sees is_active=false, throws 409 "no longer active"
  → Kit is now rejected by recordRejection (B's rejection path — kit was not consumed yet from B's perspective because A's consume already happened, so the conditional UPDATE in B would return 0 rows — but B never gets there because Fix Q's is_active check fires first)

Hmm, wait. Case 3 has a subtle issue: recordRejection(kit, 'no longer active') would try to UPDATE the kit where consumed_at IS NULL, but the kit is already consumed by A. So B's recordRejection is a no-op thanks to R's idempotent guard. Good — nothing bad happens, but the dashboard doesn't surface B's attempt either. Acceptable.

Case 4 — Two callbacks for DIFFERENT kits on the same app/config
  → No interaction; each acquires lock independently, each consumes its own kit
  → Two verification rows, both valid (this is normal: a maker may issue multiple kits)
  → Only the most recent unbroken verification matters for the readiness gate
  → (For now, the gate's orderBy: desc picks the latest. Older non-invalidated verifications are historical.)

Case 5 — Callback arrives AFTER kit expired
  → Pre-check `expires_at < new Date()` fails, returns 410 before entering transaction
  → Kit remains in its pre-existing state (unconsumed or whatever)

Case 6 — Same callback retried by caller (network timeout etc.)
  → Client sends twice. First: consumed=1, inserted, committed, 200 returned
  → Second: pre-check sees consumed_at is set → returns 409 before transaction
  → No second verification row
```

### Migration

No schema change. The `consumed_at` column already exists from v5.1.3 Fix L. Fix T is a code change in the callback handler.

Add to `apps/web/app/api/internal/ios-signing-verify/route.test.ts`:

```typescript
test('concurrent duplicate callbacks produce exactly one accepted verification', async () => {
  const kit = await issueTestKit({ appId, signingConfigId })
  const body1 = validCallback(kit)
  const body2 = validCallback(kit)  // same kit, same nonce

  const [resp1, resp2] = await Promise.all([
    POST(new Request('https://shippie.app/api/internal/ios-signing-verify', {
      method: 'POST', body: JSON.stringify(body1),
    })),
    POST(new Request('https://shippie.app/api/internal/ios-signing-verify', {
      method: 'POST', body: JSON.stringify(body2),
    })),
  ])

  // Exactly one succeeds, one fails with 409
  const statuses = [resp1.status, resp2.status].sort()
  expect(statuses).toEqual([200, 409])

  // Exactly one verification row exists
  const verifications = await db.select().from(iosSigningVerifications)
    .where(eq(iosSigningVerifications.signingConfigId, signingConfigId))
  expect(verifications).toHaveLength(1)
  expect(verifications[0].succeededAt).toBeTruthy()

  // Kit has exactly one consumption record
  const updatedKit = await db.select().from(iosVerifyKits)
    .where(eq(iosVerifyKits.id, kit.id))
    .then(r => r[0])
  expect(updatedKit.consumedAt).toBeTruthy()
  expect(updatedKit.consumptionOutcome).toBe('accepted')
})
```

---

## Migration Ordering

```
0003_v51_patches.sql     (v5.1 base)
0004_v511_patches.sql    (v5.1.1)
0005_v512_patches.sql    (v5.1.2 + v5.1.3 amendments)
0006_v514_patches.sql    (v5.1.4)
0007_v515_patches.sql    (v5.1.5)
```

No new SQL migration for v5.1.6 — it is a handler code change. Test harness additions only.

---

## Summary

| Fix | Severity | Ready |
|-----|----------|-------|
| T — atomic consume-if-unconsumed in acceptance path inside the transaction; `rowCount` check aborts concurrent duplicate callbacks | P1 | ✓ handler + test |

v5 baseline
+ v5.1 Patch 3
+ v5.1.1 A/B/C/D/E
+ v5.1.2 F/G
+ v5.1.3 J/K/L/M
+ v5.1.4 N/O/P
+ v5.1.5 Q/R/S
+ v5.1.6 T
= the implementable master spec.

### One-shot guarantee — end-to-end

A verify kit now has exactly one final state under all concurrent scenarios:

1. **Acceptance**: atomic `UPDATE ... WHERE consumed_at IS NULL RETURNING id` — exactly one callback writes `consumption_outcome = 'accepted'`, and only that callback inserts a verification row.
2. **Rejection**: `recordRejection` uses the same atomic pattern (v5.1.5 Fix R) — exactly one reason is recorded, idempotent on double-call.
3. **Expiration**: checked before transaction entry; never transitions the row, times out read-only.
4. **Unused**: kit sits at `consumed_at = null` until its `expires_at` passes, then is subject to the 180-day retention sweep.

No callback can double-consume. No callback can overwrite another's final state. No verification is inserted for a kit that is not also marked consumed in the same transaction.

Combined with:
- Fix Q's row lock (rotation race)
- Fix J's active-config filter (stale-config drift)
- Fix N's body/kit binding (client-side retargeting)
- Fix P's trigger (in-place identity edits)
- Fix K/L/O's xcodebuild real build + log markers + allowProvisioningUpdates
- Fix S's honest framing bounded by Apple review

...the iOS verification pipeline is correct, race-free, replay-free, and honest about what it actually proves.

---

## Closing Status

The patch chain v5 → v5.1.6 is now internally consistent and implementation-ready:

- **Correctness**: no known races, no replay windows, no client-trust gaps in the compliance/signing pipeline.
- **Honesty**: trust model stated accurately; what the mechanism proves vs what it doesn't is documented.
- **Schema**: all DDL changes fit into six ordered migrations (0003–0007 for v5.1 through v5.1.5; v5.1.6 is code-only).
- **Tests**: each fix ships with concrete test cases, including concurrent-scenario coverage.
- **Audit trail**: every rejected or accepted kit, every invalidated verification, every rotation, every in-place edit is forensically recoverable.

### Open Questions (carried forward — unchanged status)

1. **UI cooldown** on "Download verify kit" immediately after a rotation — Phase 1 soft fix
2. **Offline signing fallback** for corporate networks that block Apple Developer API — Phase 2 only if a real customer hits it
3. **Apple cert revocation detection** via ASC API polling — Phase 2 daily cron
4. **SOC2 threat model document** for business customers — Phase 2 alongside SOC2 Type I prep
5. **Rejected-kit retention** — 180 days, then archive; never hard-delete
6. **High rotation frequency alerting** — monitor, escalate if >10 rotations/minute on a single app
7. **`ios_verify_kits` kit lifetime** — 14 days at launch, tune after real usage
8. **Older Xcode signing markers** — maintain compatibility table per Xcode major version

---

v5.1.6 is the final material correctness patch. The spec is ready for implementation.
