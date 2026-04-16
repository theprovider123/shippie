/**
 * POST /api/deploy/trial
 *
 * Unauthenticated no-signup trial deploys. Visitor drops a zip on the
 * landing page; we stand up trial-{random}.shippie.app for 24 hours.
 *
 * Safeguards:
 *   - 50MB zip cap
 *   - 3 deploys/hour/IP (token bucket + DB backstop)
 *   - Same preflight + trust checks as authenticated deploys
 *   - Generated slug (maker cannot pick it) to eliminate squatting
 *   - TTL reaper (see /api/internal/reap-trials) archives after 24h
 *
 * Differentiation plan Pillar B2.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { deployStaticHot, deployCold } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs.ts';
import {
  TRIAL_MAKER_ID,
  TRIAL_MAX_ZIP_BYTES,
  TRIAL_PER_IP_LIMIT,
  countRecentTrialsForIp,
  generateTrialSlug,
  hashIp,
  trialUntil,
} from '@/lib/deploy/trial';
import { checkRateLimit } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.trial', async (req: NextRequest) => {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // Fast path rate limit (per-instance memory).
  const rl = checkRateLimit({
    key: `trial:${ipHash}`,
    limit: TRIAL_PER_IP_LIMIT,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // DB backstop — catches multi-instance and process restarts.
  const dbCount = await countRecentTrialsForIp(ipHash);
  if (dbCount >= TRIAL_PER_IP_LIMIT) {
    return NextResponse.json(
      { error: 'rate_limited', reason: 'too_many_trial_deploys_this_hour' },
      { status: 429 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const zip = form.get('zip');
  if (!(zip instanceof File)) {
    return NextResponse.json({ error: 'missing_zip' }, { status: 400 });
  }
  if (zip.size > TRIAL_MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: 'zip_too_large', limit_bytes: TRIAL_MAX_ZIP_BYTES },
      { status: 413 },
    );
  }

  const arrayBuffer = await zip.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  const slug = generateTrialSlug();
  const reservedSlugs = await loadReservedSlugs();

  const result = await deployStaticHot({
    slug,
    makerId: TRIAL_MAKER_ID,
    zipBuffer,
    reservedSlugs,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: 'deploy_failed',
        reason: result.reason,
        preflight: result.preflight,
      },
      { status: 400 },
    );
  }

  // Flip trial flags on the newly-inserted apps row.
  if (result.appId) {
    const db = await getDb();
    await db
      .update(schema.apps)
      .set({
        isTrial: true,
        trialUntil: trialUntil(),
        trialIpHash: ipHash,
        visibilityScope: 'unlisted',
        updatedAt: new Date(),
      })
      .where(eq(schema.apps.id, result.appId));
  }

  if (result.appId && result.deployId && result.filesForCold && result.manifestForCold) {
    const { appId, deployId, filesForCold, manifestForCold } = result;
    after(() =>
      deployCold({
        appId,
        deployId,
        slug,
        version: result.version,
        files: filesForCold,
        manifest: manifestForCold,
      }),
    );
  }

  return NextResponse.json({
    success: true,
    slug,
    deploy_id: result.deployId,
    live_url: result.liveUrl,
    expires_at: trialUntil().toISOString(),
    files: result.files,
    total_bytes: result.totalBytes,
    claim_url: `/auth/signin?claim_trial=${encodeURIComponent(slug)}`,
  });
});

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}
