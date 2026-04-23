/**
 * POST /api/deploy/wrap
 *
 * Wraps an already-hosted URL as a Shippie marketplace app. No zip build,
 * no R2 write — the Worker runtime reverse-proxies requests to the
 * upstream. Phase A only: public/lenient-CSP by default.
 *
 * Request (JSON): {
 *   slug, upstream_url, name, tagline?, type?, category, csp_mode?, theme_color?
 * }
 *
 * Spec: docs/superpowers/specs/2026-04-23-url-wrap-mode-design.md
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveUserId } from '@/lib/cli-auth';
import { createWrappedApp } from '@/lib/deploy/wrap';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

const BodySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  upstream_url: z.string().url().startsWith('https://'),
  name: z.string().min(1).max(120),
  tagline: z.string().max(280).optional(),
  type: z.enum(['app', 'web_app', 'website']).default('app'),
  category: z.string().min(1).max(48),
  csp_mode: z.enum(['lenient', 'strict']).optional(),
  theme_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  visibility_scope: z.enum(['public', 'unlisted', 'private']).default('public'),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.wrap', async (req: NextRequest) => {
  const who = await resolveUserId(req);
  if (!who) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // 20 wraps per user per hour. Enough for humans, bounded enough to catch
  // runaway scripts that might try to squat slugs.
  const rl = checkRateLimit({
    key: `wrap:${who.userId}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const parsed = await parseBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;

  const reservedSlugs = await loadReservedSlugs();
  const result = await createWrappedApp({
    slug: parsed.data.slug,
    makerId: who.userId,
    upstreamUrl: parsed.data.upstream_url,
    name: parsed.data.name,
    tagline: parsed.data.tagline,
    type: parsed.data.type,
    category: parsed.data.category,
    cspMode: parsed.data.csp_mode,
    themeColor: parsed.data.theme_color,
    visibilityScope: parsed.data.visibility_scope,
    reservedSlugs,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: 'wrap_failed', reason: result.reason },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    slug: result.slug,
    deploy_id: result.deployId,
    live_url: result.liveUrl,
    runtime_config: {
      required_redirect_uris: result.runtimeConfig.requiredRedirectUris,
    },
  });
});
