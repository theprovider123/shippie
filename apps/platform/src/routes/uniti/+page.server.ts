/**
 * /uniti — the office-manager landing (Phase 2).
 *
 * Requires a signed-in Lucia user. Loads the school instance(s) this user is a
 * VERIFIED member of (cloudlet_memberships) — no longer the Phase-1A
 * ownerEmail match. Exposes `{ instance, roles, canManage }` to the page so it
 * can route a setup-capable user (office_manager / admin) into the setup flow.
 */
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/uniti/login');

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
    classes: Awaited<ReturnType<WorkspaceStub['listClasses']>>;
    adaptationCards: Awaited<ReturnType<WorkspaceStub['listAdaptationCards']>>;
    feedbackCounts: Record<string, Record<string, number>>;
  } | null = null;

  if (instance && canTeach && env.SCHOOL_WORKSPACE) {
    const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
    const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
    const [lessons, subjects, classes, adaptationCards] = await Promise.all([
      stub.listLessons(),
      stub.listSubjects(),
      stub.listClasses(),
      stub.listAdaptationCards(),
    ]);
    // Per-lesson feedback tallies (for the progress ring on Today).
    const feedbackCounts: Record<string, Record<string, number>> = {};
    for (const l of lessons) {
      const [fb, pupils] = await Promise.all([
        stub.listFeedbackForLesson(l.id),
        stub.listPupilsForClass(l.classId),
      ]);
      const counts: Record<string, number> = {};
      for (const f of fb) counts[f.state] = (counts[f.state] ?? 0) + 1;
      counts.__assessed = fb.length;
      counts.__total = pupils.length || 28;
      feedbackCounts[l.id] = counts;
    }
    today = { lessons, subjects, classes, adaptationCards, feedbackCounts };
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

function normaliseTime(value: FormDataEntryValue | null): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return '';
  const [hh, mm] = raw.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
  const hour12 = ((hh + 11) % 12) + 1;
  const suffix = hh >= 12 ? 'pm' : 'am';
  return `${hour12}:${String(mm).padStart(2, '0')}${suffix}`;
}

export const actions: Actions = {
  addLesson: async ({ request, platform, locals }) => {
    const user = locals.user;
    if (!user) throw redirect(307, '/uniti/login');
    const env = platform?.env;
    if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
      return fail(500, { addLessonError: 'School workspace unavailable.' });
    }

    const db = getDrizzleClient(env.DB);
    const memberships = await db
      .select({
        instanceId: schema.cloudletMemberships.instanceId,
        role: schema.cloudletMemberships.role,
      })
      .from(schema.cloudletMemberships)
      .where(eq(schema.cloudletMemberships.userId, user.id));

    const instanceId = memberships[0]?.instanceId ?? null;
    const roles = memberships.map((m) => m.role as Role);
    if (!instanceId) return fail(403, { addLessonError: 'No school workspace found.' });

    const canCreate =
      user.isAdmin || roles.some((r) => roleCan([r], 'create', { type: 'lesson' }));
    if (!canCreate) return fail(403, { addLessonError: 'You cannot add lessons.' });

    const data = await request.formData();
    const classId = String(data.get('classId') ?? '').trim();
    const subjectId = String(data.get('subjectId') ?? '').trim();
    const topic = String(data.get('topic') ?? '').trim();
    const objective = String(data.get('objective') ?? '').trim();
    const start = normaliseTime(data.get('start'));
    const end = normaliseTime(data.get('end'));

    if (!classId || !subjectId || !topic || !objective || !start || !end) {
      return fail(400, { addLessonError: 'Add a class, subject, topic, objective and time.' });
    }

    const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
    const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
    const [classes, subjects] = await Promise.all([stub.listClasses(), stub.listSubjects()]);
    if (!classes.some((c) => c.id === classId)) return fail(400, { addLessonError: 'Class not found.' });
    if (!subjects.some((s) => s.id === subjectId)) {
      return fail(400, { addLessonError: 'Subject not found.' });
    }

    const lessonId = `lesson-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await stub.appendEvent({
      clientEventId: `lesson-created-${lessonId}`,
      type: 'lesson.created',
      instanceId,
      actorUserId: user.id,
      deviceId: 'web',
      createdOfflineAt: now,
      schemaVersion: 1,
      payload: {
        lessonId,
        classId,
        subjectId,
        topic,
        objective,
        time: `${start} – ${end}`,
        status: 'upcoming',
      },
    });

    throw redirect(303, `/uniti/lessons/${lessonId}`);
  },
};
