/**
 * POST /api/deploy/trial
 *
 * Anonymous trial deploys. Generates a slug, stands up trial-{rand}
 * for 24 hours. No auth required — IP-rate-limited via DB lookback.
 *
 * Contract preserved from apps/web/app/api/deploy/trial/route.ts.
 */
import { json, error } from '@sveltejs/kit';
import { eq, and, gte, count } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { deployStatic } from '$server/deploy/pipeline';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';

const TRIAL_MAKER_ID = '00000000-0000-4000-8000-trialmakerid01';
const TRIAL_MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50MB
const TRIAL_PER_IP_LIMIT = 3;
const TRIAL_TTL_MS = 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.APPS || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const ip = getClientIp(event.request);
  const ipHash = await hashIp(ip);

  // DB rate-limit: count trial apps deployed by this ipHash in last hour.
  const db = getDrizzleClient(env.DB);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCount = await db
    .select({ c: count() })
    .from(schema.apps)
    .where(
      and(
        eq(schema.apps.trialIpHash, ipHash),
        gte(schema.apps.createdAt, oneHourAgo),
      ),
    );
  if ((recentCount[0]?.c ?? 0) >= TRIAL_PER_IP_LIMIT) {
    return json(
      { error: 'rate_limited', reason: 'too_many_trial_deploys_this_hour' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    return json({ error: 'invalid_form' }, { status: 400 });
  }

  const zip = form.get('zip');
  if (!(zip instanceof File)) {
    return json({ error: 'missing_zip' }, { status: 400 });
  }
  if (zip.size > TRIAL_MAX_ZIP_BYTES) {
    return json(
      { error: 'zip_too_large', limit_bytes: TRIAL_MAX_ZIP_BYTES },
      { status: 413 },
    );
  }

  const arrayBuffer = await zip.arrayBuffer();
  const zipBuffer = new Uint8Array(arrayBuffer);

  const slug = generateTrialSlug();
  const reservedSlugs = await loadReservedSlugs(env.DB);

  const result = await deployStatic({
    slug,
    makerId: TRIAL_MAKER_ID,
    zipBuffer,
    reservedSlugs,
    db: env.DB,
    r2: env.APPS,
    kv: env.CACHE,
    publicOrigin: env.PUBLIC_ORIGIN ?? 'https://shippie.app',
  });

  if (!result.success) {
    return json(
      { error: 'deploy_failed', reason: result.reason, preflight: result.preflight },
      { status: 400 },
    );
  }

  // Flip trial flags on the freshly-inserted row.
  if (result.appId) {
    const trialUntil = new Date(Date.now() + TRIAL_TTL_MS).toISOString();
    await db
      .update(schema.apps)
      .set({
        isTrial: true,
        trialUntil,
        trialIpHash: ipHash,
        visibilityScope: 'unlisted',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.apps.id, result.appId));
  }

  return json({
    success: true,
    slug,
    deploy_id: result.deployId,
    live_url: result.liveUrl,
    expires_at: new Date(Date.now() + TRIAL_TTL_MS).toISOString(),
    files: result.files,
    total_bytes: result.totalBytes,
    claim_url: `/auth/login?claim_trial=${encodeURIComponent(slug)}`,
  });
};

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip') ?? req.headers.get('cf-connecting-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateTrialSlug(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `trial-${hex}`;
}
