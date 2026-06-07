/**
 * /uniti — the office-manager landing (Phase 2).
 *
 * Requires a signed-in Lucia user. Loads the school instance(s) this user is a
 * VERIFIED member of (cloudlet_memberships) — no longer the Phase-1A
 * ownerEmail match. Exposes `{ instance, roles, canManage }` to the page so it
 * can route a setup-capable user (office_manager / admin) into the setup flow.
 */
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login');

  const env = platform?.env;
  if (!env?.DB) return { instance: null, roles: [] as Role[], canManage: false };

  const db = getDrizzleClient(env.DB);

  // Verified membership → the school this user belongs to. Admins also see the
  // most recent instance for operational convenience.
  const memberships = await db
    .select({
      instanceId: schema.cloudletMemberships.instanceId,
      role: schema.cloudletMemberships.role,
    })
    .from(schema.cloudletMemberships)
    .where(eq(schema.cloudletMemberships.userId, user.id));

  let instanceId = memberships[0]?.instanceId ?? null;
  let roles = memberships.map((m) => m.role as Role);

  if (!instanceId && user.isAdmin) {
    const recent = await db
      .select({ id: schema.privateAppInstances.id })
      .from(schema.privateAppInstances)
      .limit(1);
    instanceId = recent[0]?.id ?? null;
    roles = instanceId ? (['owner'] as Role[]) : [];
  }

  if (!instanceId) return { instance: null, roles, canManage: false };

  const rows = await db
    .select({
      slug: schema.privateAppInstances.slug,
      name: schema.privateAppInstances.name,
      branding: schema.privateAppInstances.branding,
    })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const instance = rows[0] ?? null;
  const canManage =
    user.isAdmin || roles.some((r) => roleCan([r], 'create', { type: 'invite' }));

  return {
    instance: instance
      ? {
          slug: instance.slug,
          displayName: instance.branding?.displayName || instance.name,
        }
      : null,
    roles,
    canManage,
  };
};
