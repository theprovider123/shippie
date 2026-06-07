/**
 * GET /api/cloudlet/instances/[slug]/lessons/[lessonId]
 *
 * The Class Map payload for one lesson: the lesson, its class roster, and the
 * current feedback projection for every pupil in that lesson. RBAC-gated on
 * `lesson:read`. DO stub derived from the IMMUTABLE instance id.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'read',
    resource: { type: 'lesson' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
  const { row } = resolved;

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const lesson = await stub.getLesson(event.params.lessonId);
  if (!lesson) return json({ error: 'not_found' }, { status: 404 });

  const [pupils, subjects, feedback] = await Promise.all([
    stub.listPupilsForClass(lesson.classId),
    stub.listSubjects(),
    stub.listFeedbackForLesson(lesson.id),
  ]);
  const cls = (await stub.listClasses()).find((c) => c.id === lesson.classId) ?? null;
  const subject = subjects.find((s) => s.id === lesson.subjectId) ?? null;

  return json({ lesson, class: cls, subject, pupils, feedback });
};
