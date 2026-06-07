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
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login');

  const env = platform?.env;
  if (!env?.DB)
    return { instance: null, roles: [] as Role[], canManage: false, today: null };

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
  const canTeach =
    user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'class' }));

  // Today bootstrap — read the provisioned school's lessons + adaptation cards
  // straight from its DO so the teacher's Today screen renders without a client
  // round-trip. Only when the caller may read classroom data.
  let today: {
    lessons: Awaited<ReturnType<WorkspaceStub['listLessons']>>;
    subjects: Awaited<ReturnType<WorkspaceStub['listSubjects']>>;
    adaptationCards: Awaited<ReturnType<WorkspaceStub['listAdaptationCards']>>;
    feedbackCounts: Record<string, Record<string, number>>;
  } | null = null;

  if (instance && canTeach && env.SCHOOL_WORKSPACE) {
    const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
    const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
    const [lessons, subjects, adaptationCards] = await Promise.all([
      stub.listLessons(),
      stub.listSubjects(),
      stub.listAdaptationCards(),
    ]);
    // Per-lesson feedback tallies (for the progress ring on Today).
    const feedbackCounts: Record<string, Record<string, number>> = {};
    for (const l of lessons) {
      const fb = await stub.listFeedbackForLesson(l.id);
      const counts: Record<string, number> = {};
      for (const f of fb) counts[f.state] = (counts[f.state] ?? 0) + 1;
      counts.__assessed = fb.length;
      feedbackCounts[l.id] = counts;
    }
    today = { lessons, subjects, adaptationCards, feedbackCounts };
  }

  return {
    instance: instance
      ? {
          slug: instance.slug,
          displayName: instance.branding?.displayName || instance.name,
        }
      : null,
    roles,
    canManage,
    canTeach,
    teacher: {
      name: user.displayName || user.email?.split('@')[0] || 'Teacher',
      email: user.email,
    },
    today,
  };
};
