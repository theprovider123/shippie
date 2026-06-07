/**
 * /uniti/setup — the office-manager school-setup flow (Phase 2).
 *
 * Gated to members who can manage the school (office_manager / school_admin /
 * admin → `invite:create` capability). Loads the school instance + its current
 * members + pending invites so the Staff step can show progress. The 5 steps
 * (School → Staff → Pupils/classes → Privacy+AI → Ready) render client-side as
 * a green-tick checklist; mutations go through the cloudlet API routes.
 */
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/uniti/login?return_to=/uniti/setup');

  const env = platform?.env;
  if (!env?.DB) return { instance: null, members: [], invites: [], canManage: false };

  const db = getDrizzleClient(env.DB);

  // Resolve the school this user manages via verified membership.
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

  const canManage = user.isAdmin || roles.some((r) => roleCan([r], 'create', { type: 'invite' }));
  if (!instanceId || !canManage) {
    return { instance: null, members: [], invites: [], canManage: false };
  }

  const rows = await db
    .select({
      slug: schema.privateAppInstances.slug,
      name: schema.privateAppInstances.name,
      branding: schema.privateAppInstances.branding,
      region: schema.privateAppInstances.region,
      modules: schema.privateAppInstances.modules,
    })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);
  const instance = rows[0] ?? null;

  const members = await db
    .select({ userId: schema.cloudletMemberships.userId, role: schema.cloudletMemberships.role })
    .from(schema.cloudletMemberships)
    .where(eq(schema.cloudletMemberships.instanceId, instanceId));

  const pending = await db
    .select({
      id: schema.cloudletInvites.id,
      email: schema.cloudletInvites.email,
      role: schema.cloudletInvites.role,
      acceptedAt: schema.cloudletInvites.acceptedAt,
      revokedAt: schema.cloudletInvites.revokedAt,
    })
    .from(schema.cloudletInvites)
    .where(eq(schema.cloudletInvites.instanceId, instanceId));

  return {
    instance: instance
      ? {
          slug: instance.slug,
          displayName: instance.branding?.displayName || instance.name,
          name: instance.name,
          region: instance.region,
          modules: instance.modules ?? [],
        }
      : null,
    members,
    invites: pending.filter((p) => !p.acceptedAt && !p.revokedAt),
    canManage,
  };
};
