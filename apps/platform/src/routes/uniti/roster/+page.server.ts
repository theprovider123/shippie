/**
 * /uniti/roster — the admin "Roster / MIS" screen (Phase 7).
 *
 * Gated to members who can manage the roster (office_manager / school_admin /
 * owner / admin → `roster:manage`). Loads the school instance + the data-source
 * status (Manual / CSV / Wonde-when-configured) + the current roster summary.
 * Upload → preview → apply runs client-side against the roster API.
 */
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';
import { wondeFromEnv } from '$server/cloudlet/wonde-adapter';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login?return_to=/uniti/roster');

  const env = platform?.env;
  if (!env?.DB) return { instance: null, canManage: false, sources: [], summary: null };

  const db = getDrizzleClient(env.DB);

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

  const canManage = user.isAdmin || roles.some((r) => roleCan([r], 'manage', { type: 'roster' }));
  if (!instanceId || !canManage) {
    return { instance: null, canManage: false, sources: [], summary: null };
  }

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

  let summary: { activePupils: number; activeClasses: number; deactivatedPupils: number } | null = null;
  let wondeConfigured = false;
  if (instance && env.SCHOOL_WORKSPACE) {
    const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
    const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
    const snap = await stub.rosterSnapshot();
    summary = {
      activePupils: snap.pupils.filter((p) => p.active).length,
      activeClasses: snap.classes.filter((c) => c.active).length,
      deactivatedPupils: snap.pupils.filter((p) => !p.active).length,
    };
    wondeConfigured = wondeFromEnv(env as { WONDE_API_KEY?: string }, instance.slug).isConfigured();
  }

  return {
    instance: instance
      ? { slug: instance.slug, displayName: instance.branding?.displayName || instance.name }
      : null,
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Teacher' },
    canManage,
    sources: [
      { id: 'manual', label: 'Manual', available: true },
      { id: 'csv', label: 'CSV upload', available: true },
      { id: 'wonde', label: 'Wonde (MIS)', available: wondeConfigured },
    ],
    summary,
  };
};
