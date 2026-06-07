/**
 * /uniti/leadership — School Overview.
 *
 * Rolls up the school's feedback by subject and by vulnerable group. English is
 * split into its three strands (Reading / Writing / SPaG) per the design lock,
 * with the parent "English" headline rolled up from the strands. RBAC: a leader
 * (or admin) — gated on `progress:read`.
 *
 * Phase 3 computes rollups from whatever feedback the DO holds (the seed gives
 * a rich Maths lesson). Where a subject has no feedback yet, it shows as
 * "no data" rather than a fabricated percentage (metric-truth).
 */
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

// Map a feedback state to a 0–100 mastery score (same scale the prototype uses).
const SCORE: Record<string, number | null> = {
  got_it: 100,
  support_worked: 80,
  nearly_there: 60,
  support_not_worked: 30,
  needs_revisit: 20,
  absent: null, // absent doesn't count toward the mastery average
};

export const load: PageServerLoad = async ({ platform, locals }) => {
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

  const canRead = user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'progress' }));
  if (!canRead) throw error(403, 'forbidden');

  const inst = await db
    .select({ slug: schema.privateAppInstances.slug, name: schema.privateAppInstances.name })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const [subjects, lessons, pupils] = await Promise.all([
    stub.listSubjects(),
    stub.listLessons(),
    stub.listPupils(),
  ]);

  // Collect feedback for every lesson, tagged with the lesson's subject.
  const lessonSubject = new Map(lessons.map((l) => [l.id, l.subjectId]));
  const perSubjectScores: Record<string, number[]> = {};
  const perGroup: Record<string, { scores: number[] }> = {
    all: { scores: [] },
    SEND: { scores: [] },
    EAL: { scores: [] },
    FSM: { scores: [] },
  };
  const pupilGroups = new Map(
    pupils.map((p) => [
      p.id,
      [p.send && 'SEND', p.eal && 'EAL', p.fsm && 'FSM'].filter(Boolean) as string[],
    ]),
  );

  for (const l of lessons) {
    const subjectId = lessonSubject.get(l.id)!;
    const fb = await stub.listFeedbackForLesson(l.id);
    for (const f of fb) {
      const sc = SCORE[f.state];
      if (sc === null || sc === undefined) continue;
      (perSubjectScores[subjectId] ??= []).push(sc);
      perGroup.all.scores.push(sc);
      for (const g of pupilGroups.get(f.pupilId) ?? []) perGroup[g]?.scores.push(sc);
    }
  }

  const avg = (xs: number[]): number | null =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  // Build the subject view: parents roll up their strands; English always shows
  // its three strands explicitly.
  const parents = subjects.filter((s) => s.parentId === null);
  const subjectRows = parents.map((p) => {
    const strands = subjects.filter((s) => s.parentId === p.id);
    const ownScores = perSubjectScores[p.id] ?? [];
    const strandScores = strands.flatMap((s) => perSubjectScores[s.id] ?? []);
    const allScores = [...ownScores, ...strandScores];
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      pct: avg(allScores),
      n: allScores.length,
      strands: strands.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        pct: avg(perSubjectScores[s.id] ?? []),
        n: (perSubjectScores[s.id] ?? []).length,
      })),
    };
  });

  const groupRows = (['all', 'SEND', 'EAL', 'FSM'] as const).map((g) => ({
    label: g === 'all' ? 'All pupils' : g,
    pct: avg(perGroup[g].scores),
    n: perGroup[g].scores.length,
  }));

  return {
    slug: inst[0]?.slug ?? '',
    schoolName: inst[0]?.name ?? '',
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Teacher' },
    subjectRows,
    groupRows,
  };
};
