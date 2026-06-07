/**
 * GET /api/cloudlet/instances/[slug]/pupils/[pupilId]
 *
 * The pupil progress timeline: the pupil + their feedback over time joined to
 * lesson + subject (so the client can group by objective). RBAC-gated on
 * `pupil:read`. DO stub derived from the IMMUTABLE instance id.
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
    resource: { type: 'pupil' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
  const { row } = resolved;

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const pupil = (await stub.listPupils()).find((p) => p.id === event.params.pupilId) ?? null;
  if (!pupil) return json({ error: 'not_found' }, { status: 404 });

  const [timeline, subjects] = await Promise.all([
    stub.listFeedbackForPupil(pupil.id),
    stub.listSubjects(),
  ]);

  return json({ pupil, timeline, subjects });
};
