/**
 * POST /api/deploy/wrap
 *
 * URL-wrap deploy — register an upstream URL as a Shippie app.
 * Contract preserved from apps/web/app/api/deploy/wrap/route.ts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { createWrappedApp } from '$server/deploy/wrap';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  // Validate inline (zod isn't a dep yet — keep this self-contained).
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const upstreamUrl = typeof body.upstream_url === 'string' ? body.upstream_url : '';
  const name = typeof body.name === 'string' ? body.name : '';
  const tagline = typeof body.tagline === 'string' ? body.tagline : undefined;
  const type = (typeof body.type === 'string' ? body.type : 'app') as 'app' | 'web_app' | 'website';
  const category = typeof body.category === 'string' ? body.category : 'tools';
  const cspMode = body.csp_mode === 'strict' ? 'strict' : 'lenient';
  const themeColor = typeof body.theme_color === 'string' && HEX_RE.test(body.theme_color) ? body.theme_color : undefined;
  const visibilityScope = (typeof body.visibility_scope === 'string'
    ? body.visibility_scope
    : 'public') as 'public' | 'unlisted' | 'private';

  if (!slug || !SLUG_RE.test(slug) || slug.length > 64) {
    return json({ error: 'invalid_slug' }, { status: 400 });
  }
  if (!upstreamUrl.startsWith('https://')) {
    return json({ error: 'upstream_not_https' }, { status: 400 });
  }
  if (!name || name.length > 120) {
    return json({ error: 'invalid_name' }, { status: 400 });
  }
  if (!['app', 'web_app', 'website'].includes(type)) {
    return json({ error: 'invalid_type' }, { status: 400 });
  }
  if (!['public', 'unlisted', 'private'].includes(visibilityScope)) {
    return json({ error: 'invalid_visibility_scope' }, { status: 400 });
  }

  const reservedSlugs = await loadReservedSlugs(env.DB);
  const result = await createWrappedApp({
    slug,
    makerId: who.userId,
    upstreamUrl,
    name,
    tagline,
    type,
    category,
    cspMode,
    themeColor,
    visibilityScope,
    reservedSlugs,
    db: env.DB,
    kv: env.CACHE,
    publicOrigin: env.PUBLIC_ORIGIN ?? 'https://shippie.app',
  });

  if (!result.success) {
    return json({ error: 'wrap_failed', reason: result.reason }, { status: 400 });
  }

  return json({
    success: true,
    slug: result.slug,
    deploy_id: result.deployId,
    live_url: result.liveUrl,
    runtime_config: {
      required_redirect_uris: result.runtimeConfig.requiredRedirectUris,
    },
  });
};
