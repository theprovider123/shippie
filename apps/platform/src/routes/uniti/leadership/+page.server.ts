/**
 * /uniti/leadership — School Overview (Phase 8 leadership rollups).
 *
 * Deepened to the Phase-0 leadership design: subject progress (English split
 * into Reading / Writing / SPaG with a rolled-up English headline + drill-down),
 * pupils-to-revisit, top strategies, inclusion / vulnerable groups, and
 * adaptation impact — all from the SAME append-only lesson-feedback evidence,
 * rolled up deterministically (no AI, no over-claiming).
 *
 * HONESTY GUARD: everything is "lesson feedback evidence", never "attainment".
 * RBAC: a leader / school_admin / owner — gated on `progress:read`.
 *
 * The heavy lifting is the reusable `computeLeadershipRollup` primitive,
 * composed server-side by `buildLeadershipRollup`. This route only resolves the
 * instance + caller capability and shapes the result for the view.
 */
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import { buildLeadershipRollup } from '$server/cloudlet/leadership-rollup';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/uniti/login');
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

  const canRead = user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'progress' }));
  if (!canRead) throw error(403, 'forbidden');

  const inst = await db
    .select({ slug: schema.privateAppInstances.slug, name: schema.privateAppInstances.name })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  // scope=historic includes leavers (tombstoned) as historic evidence.
  const includeHistoric = url.searchParams.get('scope') === 'historic';

  const [events, subjects, lessons, snapshot] = await Promise.all([
    stub.listEvents(),
    stub.listSubjects(),
    stub.listLessons(),
    stub.rosterSnapshot(),
  ]);

  const rollup = buildLeadershipRollup({
    instanceId,
    events,
    subjects,
    lessons,
    roster: snapshot.pupils,
    activeOnly: !includeHistoric,
  });

  // Resolve pupil ids → names for the pupils-to-revisit list.
  const nameById = new Map(snapshot.pupils.map((p) => [p.id, p.name]));
  const pupilsToRevisit = rollup.pupilsToRevisit.slice(0, 12).map((p) => ({
    name: nameById.get(p.pupilId) ?? p.pupilId,
    active: p.active,
    objectives: p.objectives.map((o) => o.objective),
  }));

  return {
    slug: inst[0]?.slug ?? '',
    schoolName: inst[0]?.name ?? '',
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Teacher' },
    includeHistoric,
    evidenceBasis: rollup.evidenceBasis,
    disclaimer: rollup.disclaimer,
    totals: rollup.totals,
    subjects: rollup.subjects,
    inclusion: rollup.inclusion,
    topStrategies: rollup.topStrategies.slice(0, 6),
    adaptationsUsed: rollup.adaptationsUsed.slice(0, 6),
    adaptationImpact: rollup.adaptationImpact,
    pupilsToRevisit,
  };
};
