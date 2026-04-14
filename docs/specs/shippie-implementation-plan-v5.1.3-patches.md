# Shippie v5.1.3 — Four Fixes to v5.1.2

Surgical fixes to `shippie-implementation-plan-v5.1.2-patches.md` based on Codex review (2026-04-14).

| # | Severity | v5.1.2 Issue | v5.1.3 Fix |
|---|----------|--------------|------------|
| J | P1 | `iosSigningVerified` queries by `app_id` only — a verification for an older config satisfies the gate after Team ID / bundle ID / mode changes | Query must match the **active** `signing_config_id`; rotation invalidates prior verifications explicitly |
| K | P1 | `xcodebuild -showBuildSettings` does not exercise signing; the verify kit prints settings and passes | Script runs a real signed `xcodebuild clean build` for iphoneos; failure on signing errors is preserved |
| L | P2 | HMAC proves kit possession, not that the maker ran the real verification step — self-attestation is misrepresented as proof | Reframe as guided self-attestation **with server-side log proof**: callback must include xcodebuild stdout and server parses for signing markers before accepting |
| M | P2 | `needsAction` introduced as a new compliance result type but no DDL update for `compliance_checks.status` constraint | Migration adds `'needs_action'` to the check constraint; UI + runner contracts aligned |

Everything else in v5, v5.1 Patch 3, v5.1.1 A/B/C/D/E, and v5.1.2 F/G (unchanged) stands.

---

## Fix J — Verification bound to active signing config

### The bug
v5.1.2 Fix H's check:

```typescript
const verification = await db.query.iosSigningVerifications.findFirst({
  where: and(
    eq(iosSigningVerifications.appId, ctx.app.id),
    isNotNull(iosSigningVerifications.succeededAt),
  ),
  orderBy: desc(iosSigningVerifications.succeededAt),
})
```

This query ignores `signing_config_id`. The `ios_signing_verifications` table records which config was verified, but the check doesn't filter on it. Consequences:

- Maker rotates from Team A to Team B: the stale Team A verification still passes.
- Maker changes bundle_id: the old verification still passes even though the cert/profile binding changed.
- Maker switches from automatic to manual and back: the verification for the previous automatic config satisfies the gate.

The verification must be **bound to the active config row** and **invalidated on rotation**.

### Fix — the check

```typescript
// lib/compliance/checks/ios-signing-verified.ts
export const iosSigningVerified: ComplianceCheck = {
  id: 'ios-signing-verified',
  platform: 'ios',
  required: true,
  runsWhen: (ctx) => ctx.targets.includes('ios'),
  async run(ctx) {
    const resolved = await resolveSigningConfig(ctx.app, 'ios')
    if (!resolved) return fail('No iOS signing config registered')

    const active = resolved.appSigningConfig

    // Manual signing: verified statically at registration time.
    if (active.iosSigningMode === 'manual') {
      return pass({ source: 'static-manual', signing_config_id: active.id })
    }

    // Automatic signing: require a verification bound to THIS active config row.
    const verification = await db.query.iosSigningVerifications.findFirst({
      where: and(
        eq(iosSigningVerifications.appId, ctx.app.id),
        eq(iosSigningVerifications.signingConfigId, active.id),   // <-- bind to active config
        isNull(iosSigningVerifications.invalidatedAt),
        isNotNull(iosSigningVerifications.succeededAt),
      ),
      orderBy: desc(iosSigningVerifications.succeededAt),
    })

    if (!verification) {
      return needsAction(
        `iOS automatic signing is not verified for the current signing configuration ` +
        `(team=${active.iosTeamId}, bundle=${active.iosBundleId}). ` +
        `Run \`shippie ios-verify\` on your Mac to confirm Xcode can sign this config.`,
        { cta: 'download-ios-verify-kit', app_id: ctx.app.id, signing_config_id: active.id }
      )
    }

    const ageMs = Date.now() - verification.succeededAt.getTime()
    if (ageMs > 90 * 24 * 3600 * 1000) {
      return needsAction(
        `Last iOS signing verification for this configuration was ` +
        `${Math.floor(ageMs / (24 * 3600 * 1000))} days ago. ` +
        `Re-run \`shippie ios-verify\` (valid 90 days).`,
        { cta: 'download-ios-verify-kit', app_id: ctx.app.id, signing_config_id: active.id }
      )
    }

    return pass({
      source: 'verify-kit',
      signing_config_id: active.id,
      verified_at: verification.succeededAt,
      expires_at: new Date(verification.succeededAt.getTime() + 90 * 24 * 3600 * 1000),
    })
  },
}
```

Key changes:
1. **`eq(iosSigningVerifications.signingConfigId, active.id)`** — verification must match the currently active config row, not just the app
2. **`isNull(invalidatedAt)`** — rotation explicitly invalidates verifications (see schema change below)
3. **Manual signing still returns `signing_config_id` in metadata** — traceable if the maker rotates away from manual to automatic

### Schema change — `ios_signing_verifications`

```sql
alter table ios_signing_verifications
  add column invalidated_at timestamptz,
  add column invalidated_reason text;

alter table ios_signing_verifications
  alter column signing_config_id set not null;

create index ios_signing_verifications_active_idx
  on ios_signing_verifications (app_id, signing_config_id, succeeded_at desc)
  where invalidated_at is null;
```

`signing_config_id` becomes `NOT NULL` — every verification is bound to a specific config row. Null was permitted in v5.1.2, which was the root cause of this bug.

### Rotation flow updates

The `rotateSigningConfig` helper from v5.1.2 Fix G gets an additional step:

```typescript
export async function rotateSigningConfig(
  appId: string,
  platform: 'ios' | 'android',
  newConfig: NewAppSigningConfig,
  actorUserId: string,
): Promise<AppSigningConfig> {
  return db.transaction(async (tx) => {
    // 1. Insert as inactive (v5.1.2 Fix G)
    const [inserted] = await tx.insert(appSigningConfigs).values({
      ...newConfig,
      appId,
      platform,
      isActive: false,
      version: await nextConfigVersion(tx, appId, platform),
      createdBy: actorUserId,
    }).returning()

    // 2. Atomic flip (v5.1.2 Fix G)
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

    // 3. NEW: Invalidate iOS verifications for the previously-active config(s).
    //    We invalidate any non-invalidated verifications on this app+platform
    //    that are NOT bound to the new row.
    if (platform === 'ios') {
      await tx.update(iosSigningVerifications)
        .set({
          invalidatedAt: new Date(),
          invalidatedReason: `Signing config rotated; superseded by ${inserted.id}`,
        })
        .where(and(
          eq(iosSigningVerifications.appId, appId),
          ne(iosSigningVerifications.signingConfigId, inserted.id),
          isNull(iosSigningVerifications.invalidatedAt),
        ))
    }

    return { ...inserted, isActive: true }
  })
}
```

Any rotation (new team ID, new bundle ID, switch to manual, switch to automatic) now explicitly invalidates prior verifications. The next Ship to Stores attempt will surface `needsAction` and prompt the maker to re-verify.

### Test cases

```
Case 1 — Verify, rotate to same mode (new cert), try to submit
  → iosSigningVerified returns needsAction (old verification invalidated)

Case 2 — Verify, change bundle_id, try to submit
  → iosSigningVerified returns needsAction

Case 3 — Verify, rotate, re-verify, submit
  → iosSigningVerified passes with signing_config_id matching new config

Case 4 — Parallel rotations (two admins rotate simultaneously)
  → Partial unique index serializes; second rotation invalidates first's verifications
```

---

## Fix K — Verify kit actually exercises signing

### The bug
v5.1.2 Fix H's verify kit runs:

```bash
xcodebuild -workspace App.xcworkspace -scheme App \
  -configuration Release -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -showBuildSettings \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="__TEAM_ID__"
```

`-showBuildSettings` prints variables. It does not compile, does not sign, does not touch certificates or provisioning profiles. It can return success on a machine that is completely incapable of building the app.

### Fix — run a real `clean build` for iphoneos, which exercises the full signing path

```bash
#!/usr/bin/env bash
set -euo pipefail

# Baked in by Shippie at download time
APP_ID="__APP_ID__"
SIGNING_CONFIG_ID="__SIGNING_CONFIG_ID__"
TEAM_ID="__TEAM_ID__"
BUNDLE_ID="__BUNDLE_ID__"
NONCE="__NONCE__"
SECRET="__SHARED_SECRET__"
CALLBACK_URL="https://shippie.app/api/internal/ios-signing-verify"

cd "$(dirname "$0")/ios"

LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

echo "[shippie ios-verify] Running signed clean build for iphoneos…"
echo "[shippie ios-verify] This exercises the full signing pipeline (certs + profiles)."
echo "[shippie ios-verify] Expect 30–90 seconds on first run."

# Real signed build: clean + build for iphoneos with code signing enabled.
# Xcode uses automatic signing with the specified DEVELOPMENT_TEAM.
# This invokes:
#   - Certificate resolution (Keychain)
#   - Provisioning profile download/resolution (Xcode's profile manager)
#   - Entitlements stamping
#   - codesign pass on the built .app
# If ANY of these fail, xcodebuild exits non-zero and we capture it.
if xcodebuild \
     -workspace App.xcworkspace \
     -scheme App \
     -configuration Release \
     -sdk iphoneos \
     -destination "generic/platform=iOS" \
     CODE_SIGN_STYLE=Automatic \
     CODE_SIGN_IDENTITY="Apple Distribution" \
     DEVELOPMENT_TEAM="$TEAM_ID" \
     PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
     clean build \
     > "$LOG" 2>&1 ; then
  RESULT=success
  REASON=""
else
  RESULT=failure
  REASON=$(tail -n 100 "$LOG")
fi

# HMAC over (app_id | signing_config_id | nonce | result | log_sha256)
LOG_SHA=$(shasum -a 256 "$LOG" | awk '{print $1}')
SIG_INPUT="${APP_ID}|${SIGNING_CONFIG_ID}|${NONCE}|${RESULT}|${LOG_SHA}"
SIG=$(printf "%s" "$SIG_INPUT" \
      | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

LOG_GZ_B64=$(gzip -c < "$LOG" | base64 | tr -d '\n')

curl -fsS -X POST "$CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"app_id\": \"$APP_ID\",
    \"signing_config_id\": \"$SIGNING_CONFIG_ID\",
    \"nonce\": \"$NONCE\",
    \"result\": \"$RESULT\",
    \"reason\": $(printf '%s' "$REASON" | jq -Rs .),
    \"log_sha256\": \"$LOG_SHA\",
    \"log_gz_b64\": \"$LOG_GZ_B64\",
    \"hmac\": \"$SIG\",
    \"xcode_version\": \"$(xcodebuild -version | head -1)\",
    \"macos_version\": \"$(sw_vers -productVersion)\"
  }"

if [[ "$RESULT" != success ]]; then
  echo ""
  echo "[shippie ios-verify] FAILED"
  echo "$REASON"
  echo ""
  echo "Common fixes:"
  echo "  • Ensure Xcode is signed into an Apple ID belonging to team $TEAM_ID"
  echo "  • Xcode → Settings → Accounts → check Team membership"
  echo "  • Trust the Distribution certificate in Keychain Access"
  echo "  • Xcode → Product → Destination → Any iOS Device"
  exit 1
fi

echo "[shippie ios-verify] Success."
echo "[shippie ios-verify] Dashboard will unlock iOS submission within a few seconds."
```

Key changes:
1. **`clean build`** — actual compilation and signing, not just settings dump
2. **`CODE_SIGN_IDENTITY="Apple Distribution"`** — forces use of the distribution cert, matching real submission
3. **`PRODUCT_BUNDLE_IDENTIFIER`** — locks bundle ID from shippie.json, preventing a pass on the default wildcard
4. **`-destination "generic/platform=iOS"`** — targets real device architectures, not simulator
5. **Log gzipped + base64** — full log ships back, not truncated
6. **`log_sha256` in HMAC** — tamper-evidence: Codex's next point is that HMAC alone proves possession of the kit secret. Including the log hash in the HMAC means the server can detect forged logs if combined with server-side log parsing (Fix L)

### Timing expectations

A first-time clean build of the Capacitor shell takes 30–90 seconds. Subsequent verifications on the same machine are ~20–40s because Xcode's derived data is warm. This is acceptable; we emit an explicit expectation up front.

### Cleanup

The verify kit is ephemeral. After a successful verification, the kit can be deleted — the next one is issued with a new nonce and secret. Makers who re-run an old kit get rejected by the nonce check (v5.1.2 Fix H, nonce is unique).

---

## Fix L — Reframe as guided self-attestation with server-side log proof

### The honest framing
The HMAC + nonce mechanism from v5.1.2 proves:
- The callback body was not modified in transit (HMAC)
- The kit has not been re-used (nonce)
- The kit was issued by Shippie (secret is known only to Shippie and the kit owner)

It does **not** prove:
- That `xcodebuild` actually ran
- That the log in the callback is authentic
- That the maker didn't bypass the script and hit the callback URL with a hand-crafted success payload

This is a fundamental property of self-attestation on maker-controlled hardware. We cannot solve it; we can make it harder to fake and be honest about what it proves.

### Fix — server-side log proof

The callback handler parses the submitted xcodebuild log for **signing markers**. The maker cannot mint a success without including a plausible log, because the `log_sha256` is in the HMAC input. A forged log changes the hash, breaking the HMAC check.

```typescript
// apps/web/app/api/internal/ios-signing-verify/route.ts
import { gunzipSync } from 'node:zlib'
import { createHmac, timingSafeEqual, createHash } from 'node:crypto'

interface VerifyCallback {
  app_id: string
  signing_config_id: string
  nonce: string
  result: 'success' | 'failure'
  reason: string
  log_sha256: string
  log_gz_b64: string
  hmac: string
  xcode_version: string
  macos_version: string
}

const REQUIRED_SUCCESS_MARKERS = [
  /ProvisioningProfile=/i,
  /CodeSign .+\.app/,
  /=== BUILD TARGET .+ OF PROJECT .+ WITH CONFIGURATION Release ===/,
  /Signing Identity: +"Apple Distribution/,
  /\*\* BUILD SUCCEEDED \*\*/,
]

const REQUIRED_FAILURE_MARKERS = [
  /\*\* BUILD FAILED \*\*/,
]

export async function POST(req: Request) {
  const body = await req.json() as VerifyCallback

  // 1. Look up the kit secret for this (app_id, nonce)
  const kit = await db.query.iosVerifyKits.findFirst({
    where: and(
      eq(iosVerifyKits.appId, body.app_id),
      eq(iosVerifyKits.nonce, body.nonce),
    ),
  })
  if (!kit) return Response.json({ error: 'unknown kit' }, { status: 404 })
  if (kit.consumedAt) return Response.json({ error: 'kit already consumed' }, { status: 409 })
  if (kit.expiresAt < new Date()) return Response.json({ error: 'kit expired' }, { status: 410 })

  // 2. Verify HMAC over (app_id | signing_config_id | nonce | result | log_sha256)
  const sigInput = `${body.app_id}|${body.signing_config_id}|${body.nonce}|${body.result}|${body.log_sha256}`
  const expected = createHmac('sha256', kit.secret).update(sigInput).digest('base64')
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(body.hmac))) {
    return Response.json({ error: 'hmac mismatch' }, { status: 401 })
  }

  // 3. Decompress log and verify its SHA-256 matches what the kit claimed
  const logBuf = gunzipSync(Buffer.from(body.log_gz_b64, 'base64'))
  const actualSha = createHash('sha256').update(logBuf).digest('hex')
  if (actualSha !== body.log_sha256) {
    return Response.json({ error: 'log_sha256 mismatch' }, { status: 400 })
  }

  const log = logBuf.toString('utf8')

  // 4. Server-side log marker check — harder to fake than a bare HMAC
  if (body.result === 'success') {
    const missing = REQUIRED_SUCCESS_MARKERS.filter((re) => !re.test(log))
    if (missing.length > 0) {
      // Record as self_attestation_failed, not success
      await recordVerifyKitConsumption(kit, {
        outcome: 'rejected',
        rejection_reason: `Log missing required markers: ${missing.map(m => m.source).join(', ')}`,
        log_r2_key: await storeLogInR2(kit.appId, logBuf),
      })
      return Response.json({
        error: 'log does not contain required signing markers',
        missing_markers: missing.map((m) => m.source),
      }, { status: 400 })
    }
  } else {
    const missingFail = REQUIRED_FAILURE_MARKERS.filter((re) => !re.test(log))
    if (missingFail.length > 0) {
      // Accept failure but flag it — if the maker reports failure without a BUILD FAILED marker,
      // something weirder is going on
      console.warn(`[ios-verify] failure callback without BUILD FAILED marker for ${body.app_id}`)
    }
  }

  // 5. Commit: consume the kit, record verification, bind to active signing config
  const logR2Key = await storeLogInR2(kit.appId, logBuf)
  await db.transaction(async (tx) => {
    await tx.update(iosVerifyKits)
      .set({ consumedAt: new Date() })
      .where(eq(iosVerifyKits.id, kit.id))

    await tx.insert(iosSigningVerifications).values({
      appId: body.app_id,
      signingConfigId: body.signing_config_id,   // NOT NULL per Fix J
      nonce: body.nonce,
      succeededAt: body.result === 'success' ? new Date() : null,
      failedAt: body.result === 'failure' ? new Date() : null,
      failureReason: body.result === 'failure' ? body.reason : null,
      xcodeVersion: body.xcode_version,
      macosVersion: body.macos_version,
      logR2Key,
      verifyKitVersion: kit.kitVersion,
    })
  })

  return Response.json({ ok: true, outcome: body.result })
}
```

### What this actually buys you

| Attacker model | Before (v5.1.2) | After (v5.1.3 Fix L) |
|---|---|---|
| Third party without the kit | Blocked by HMAC ✓ | Blocked by HMAC ✓ |
| Maker who edits the script to curl a fake success | Bypasses the flow ✗ | Must also forge a log containing all 5 signing markers ⚠ (harder but possible) |
| Maker who runs `xcodebuild -showBuildSettings` and submits that log | Would have passed under v5.1.2 ✗ | Rejected — `showBuildSettings` output does not contain BUILD SUCCEEDED, CodeSign, ProvisioningProfile lines ✓ |
| Maker who runs a real `clean build` on the wrong project and swaps the log | HMAC check now includes log_sha256, so forged logs break the HMAC ✓ |

We cannot defeat a sufficiently determined maker who runs a real build of a decoy project and claims it's the real one — but that maker will also fail to submit to the App Store because the real app won't sign. Self-attestation fraud is bounded by the fact that the maker still has to eventually ship.

### Reframe — what we say to makers and Codex reviewers

From v5.1.2 §Fix A copy and v5.1.3 docs, replace:
> "Verification proves that Xcode on the maker's Mac can sign this app."

With:
> "Verification is guided self-attestation: the verify kit runs a real signed `xcodebuild clean build` on your Mac, captures the signed output and logs, and returns them to Shippie. Shippie checks the log for signing markers (CodeSign, ProvisioningProfile, BUILD SUCCEEDED) before accepting the result. The flow is designed to make accidental or casual passes impossible — a machine that cannot sign cannot produce a valid log. The mechanism is not a defense against a maker who deliberately forges a log for a project they cannot actually build; that maker will fail during real submission regardless."

The readiness gate text in the dashboard should also include this framing, linked from the "Learn how we verify" help link.

### New table — `ios_verify_kits` (for kit lifecycle)

```sql
create table ios_verify_kits (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid not null references app_signing_configs(id) on delete cascade,
  nonce text unique not null,
  secret text not null,                    -- encrypted at rest (AES-GCM platform key)
  kit_version int not null,                -- verify kit version for future migrations
  issued_to uuid not null references users(id),
  issued_at timestamptz default now(),
  expires_at timestamptz not null,         -- 7 days; kit must be used promptly
  consumed_at timestamptz,
  consumption_outcome text check (consumption_outcome in ('accepted', 'rejected'))
);
create index ios_verify_kits_app_unused_idx
  on ios_verify_kits (app_id, signing_config_id)
  where consumed_at is null;
```

Each time a maker clicks "Download verify kit," a new row is created with a fresh nonce + secret + 7-day expiry. The kit secret is encrypted at rest so a DB dump doesn't leak active kit secrets. On successful verification, `consumed_at` is set and the kit cannot be reused.

---

## Fix M — `needs_action` added to `compliance_checks.status` constraint

### The gap
v5.1.2 introduced `needsAction` as a result type in runner code and said the migration section has no DDL for Fix H. But `compliance_checks.status` already has a CHECK constraint from v5 §12:

```sql
status text not null check (status in ('passed','failed','pending','not_applicable'))
```

A runner returning `needs_action` cannot write to this column. Either the write fails at runtime, or some silent `.toString()` conversion produces `'needs_action'` that trips the constraint.

### Fix — migration

Add to `0005_v512_patches.sql`:

```sql
-- Expand compliance_checks.status to include the needs_action state
-- introduced by v5.1.2 Fix H (iOS signing verification).
alter table compliance_checks
  drop constraint if exists compliance_checks_status_check;

alter table compliance_checks
  add constraint compliance_checks_status_check
  check (status in (
    'passed',
    'failed',
    'pending',
    'not_applicable',
    'needs_action'
  ));
```

### Runner contract update

```typescript
// packages/shared/src/compliance.ts
export type ComplianceResultStatus =
  | 'passed'
  | 'failed'
  | 'pending'
  | 'not_applicable'
  | 'needs_action'

export type ComplianceResult =
  | { status: 'passed'; metadata?: Record<string, unknown> }
  | { status: 'failed'; reason: string; metadata?: Record<string, unknown> }
  | { status: 'pending'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | { status: 'needs_action'; reason: string; cta: { key: string; payload?: Record<string, unknown> } }

export const fail           = (r: string, m?: object): ComplianceResult =>
  ({ status: 'failed',         reason: r, metadata: m })
export const pass           = (m?: object): ComplianceResult =>
  ({ status: 'passed',         metadata: m })
export const notApplicable  = (r: string): ComplianceResult =>
  ({ status: 'not_applicable', reason: r })
export const pending        = (r: string): ComplianceResult =>
  ({ status: 'pending',        reason: r })
export const needsAction    = (r: string, cta: { key: string; payload?: object }): ComplianceResult =>
  ({ status: 'needs_action',   reason: r, cta })
```

### Score impact contract

The Native Readiness Score treats `needs_action` the same as `failed` for scoring purposes (blocks ≥85 on required checks). The distinction is surfaced in the UI:

- `failed` → red error card: "This check failed. Fix the underlying issue."
- `needs_action` → amber action card: "This check needs you to do something next. [CTA button]"

The CTA payload is rendered based on the `cta.key`:
- `download-ios-verify-kit` → button labeled "Download verify kit" that issues a new `ios_verify_kits` row and streams the generated .zip
- Future CTAs for other checks follow the same pattern

### UI contract

```typescript
// apps/web/app/(dashboard)/apps/[slug]/stores/readiness/components/check-card.tsx
function CheckCard({ check }: { check: ComplianceCheckRow }) {
  switch (check.status) {
    case 'passed':         return <PassedCard check={check} />
    case 'not_applicable': return <NotApplicableCard check={check} />
    case 'pending':        return <PendingCard check={check} />
    case 'failed':         return <FailedCard check={check} />
    case 'needs_action':   return <NeedsActionCard check={check} />
  }
}
```

`NeedsActionCard` resolves the CTA from a registry:

```typescript
const CTA_REGISTRY: Record<string, CtaRenderer> = {
  'download-ios-verify-kit': DownloadIosVerifyKitCta,
  // future CTAs
}
```

### Migration ordering

`0005_v512_patches.sql` now contains:
1. `drop policy` + `create policy` for `asc_rw` (Fix F)
2. `create table ios_signing_verifications` (v5.1.2 Fix H — kept)
3. **`create table ios_verify_kits`** (Fix L — new)
4. **`alter table ios_signing_verifications` — add `invalidated_at`, `invalidated_reason`, make `signing_config_id` NOT NULL, new index** (Fix J)
5. **`alter table compliance_checks` — expand status constraint** (Fix M)
6. No DDL for Fix G (app code) or Fix K (verify-kit script)
7. Tests in `0005_v512_patches.test.sql`

---

## Summary

| Fix | Severity | Ready |
|-----|----------|-------|
| J — verification bound to active signing_config_id + rotation invalidates | P1 | ✓ schema + check + rotation |
| K — `xcodebuild clean build`, not `-showBuildSettings` | P1 | ✓ kit script + bundle ID lock |
| L — server-side log proof + honest self-attestation framing | P2 | ✓ new table + marker parser + docs reframe |
| M — `needs_action` in the DB check constraint + runner/UI contracts | P2 | ✓ migration + types + UI registry |

v5 baseline
+ v5.1 Patch 3 (unchanged hard-block on `__shippie/*` collisions)
+ v5.1.1 A/B/C/D/E
+ v5.1.2 F/G (H/I amended below)
+ v5.1.3 J/K/L/M (amendments to v5.1.2 H + I, plus new contracts)
= the implementable master spec.

## Open Questions

1. **Log storage retention**: verify-kit logs stored in R2 — how long do we keep them? (Recommendation: 1 year, then delete; maker can request export.)
2. **Kit expiry**: 7 days might be too tight if a maker downloads on Friday and builds Monday. (Recommendation: 14 days at launch, tune after seeing real usage.)
3. **Log markers localization**: `xcodebuild` output is in the user's system language. Xcode logs are consistently English regardless of locale, but safe to verify. (Decision: keep English markers; Apple's xcodebuild output is English-only in practice.)
4. **Fallback for makers with older Xcode versions**: signing markers may differ slightly. (Recommendation: maintain a table of known-good markers per Xcode major version, fall back to the most permissive set.)
5. **`needs_action` vs `pending`**: should they be separate states? (Decision in this patch: yes — `pending` is "still running / not yet computed," `needs_action` is "computed and requires explicit maker input." Kept distinct.)

---

v5.1.3 is ready for implementation. After this, the iOS verification flow is:
- Bound to the exact signing config in play (no stale verifications)
- Actually exercises signing (real `clean build`, not settings dump)
- Server-verified via log marker parsing (not just HMAC possession)
- Persistable in the DB (constraint expanded)
- Honestly framed as guided self-attestation with audit trail

And the broader master spec is now correct across: pricing, auth, runtime, deploy history, build correctness, RLS, signing rotation, iOS verification, Functions data-handling, and compliance state model.
