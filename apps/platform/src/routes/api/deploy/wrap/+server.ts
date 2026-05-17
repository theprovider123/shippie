/**
 * POST /api/deploy/wrap
 *
 * URL-wrap deploy — register an upstream URL as a Shippie app.
 * Contract preserved from apps/web/app/api/deploy/wrap/route.ts.
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { createWrappedApp } from '$server/deploy/wrap';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';
import { getDrizzleClient, schema } from '$server/db/client';

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
    : 'public') as 'public' | 'unlisted' | 'private' | 'team';
  const organization = typeof body.organization === 'string'
    ? body.organization
    : typeof body.organization_id === 'string'
      ? body.organization_id
      : '';

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
  if (!['public', 'unlisted', 'private', 'team'].includes(visibilityScope)) {
    return json({ error: 'invalid_visibility_scope' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);
  const organizationId =
    visibilityScope === 'team'
      ? await resolveWrapOrganization(db, who.userId, organization)
      : undefined;
  if (visibilityScope === 'team' && !organizationId) {
    return json({ error: 'invalid_or_forbidden_organization' }, { status: 403 });
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
    organizationId,
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

async function resolveWrapOrganization(
  db: ReturnType<typeof getDrizzleClient>,
  userId: string,
  organization: string,
): Promise<string | null> {
  if (!organization) return null;
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(
      or(
        eq(schema.organizations.id, organization),
        eq(schema.organizations.slug, organization),
      ),
    )
    .limit(1);
  if (!org) return null;

  const [member] = await db
    .select({ role: schema.organizationMembers.role })
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.orgId, org.id),
        eq(schema.organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  return member && (member.role === 'admin' || member.role === 'deployer') ? org.id : null;
}
