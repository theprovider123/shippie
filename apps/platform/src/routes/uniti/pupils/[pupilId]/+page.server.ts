/**
 * /uniti/pupils/[pupilId] — Pupil progress timeline.
 *
 * Loads the pupil + their feedback over time (joined to lesson + subject) from
 * the school DO so the page can render the timeline grouped by objective. Also
 * passes the full pupil list so the page offers a "viewing" selector.
 * RBAC: `pupil:read`.
 */
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const load: PageServerLoad = async ({ platform, locals, params }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login');
  const env = platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) throw error(500, 'platform bindings unavailable');

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
  if (!instanceId) throw redirect(307, '/uniti');

  const canRead = user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'pupil' }));
  if (!canRead) throw error(403, 'forbidden');

  const inst = await db
    .select({ slug: schema.privateAppInstances.slug, name: schema.privateAppInstances.name })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const allPupils = await stub.listPupils();
  const pupil = allPupils.find((p) => p.id === params.pupilId) ?? null;
  if (!pupil) throw error(404, 'pupil not found');

  const [timeline, subjects] = await Promise.all([
    stub.listFeedbackForPupil(pupil.id),
    stub.listSubjects(),
  ]);

  return {
    slug: inst[0]?.slug ?? '',
    schoolName: inst[0]?.name ?? '',
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Teacher' },
    pupil,
    pupils: allPupils,
    timeline,
    subjects,
  };
};
