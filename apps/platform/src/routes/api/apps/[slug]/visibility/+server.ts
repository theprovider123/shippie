/**
 * PATCH /api/apps/[slug]/visibility
 *
 * Maker-only flip between public / unlisted / private / team. Updates the apps
 * row + propagates to the runtime KV `apps:{slug}:meta` row so the
 * Worker access-gate picks it up.
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';

export const PATCH: RequestHandler = async (event) => {
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

  const visibility = body.visibility_scope;
  if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private' && visibility !== 'team') {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  const organization = typeof body.organization === 'string'
    ? body.organization
    : typeof body.organization_id === 'string'
      ? body.organization_id
      : '';

  const db = getDrizzleClient(env.DB);
  const slug = event.params.slug!;

  const [app] = await db
    .select({
      id: schema.apps.id,
      makerId: schema.apps.makerId,
      organizationId: schema.apps.organizationId,
      visibilityScope: schema.apps.visibilityScope,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  const organizationId =
    visibility === 'team'
      ? await resolveTeamOrganization(db, who.userId, organization || app.organizationId || '')
      : app.organizationId;
  if (visibility === 'team' && !organizationId) {
    return json({ error: 'invalid_or_forbidden_organization' }, { status: 403 });
  }

  await db
    .update(schema.apps)
    .set({ visibilityScope: visibility, organizationId, updatedAt: new Date().toISOString() })
    .where(eq(schema.apps.id, app.id));

  await db.insert(schema.auditLog).values({
    organizationId: organizationId ?? null,
    actorUserId: who.userId,
    action: visibility === 'public' && app.visibilityScope !== 'public' ? 'promoted' : 'visibility_changed',
    targetType: 'app',
    targetId: app.id,
    metadata: {
      slug,
      before: app.visibilityScope,
      after: visibility,
    },
  });

  await patchAppMeta(env.CACHE, slug, {
    visibility_scope: visibility,
    organization_id: organizationId ?? undefined,
  });

  return json({ success: true });
};

async function resolveTeamOrganization(
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
