/**
 * GET /api/cloudlet/instances/[slug]/workspace
 *
 * The Today-screen bootstrap: returns this school's classes, pupils, lessons,
 * subjects (English split into reading/writing/spag strands) and adaptation
 * cards in one round-trip. RBAC-gated — the caller must hold `class:read` in
 * THIS instance (teacher / leader / office_manager / admin). The DO stub is
 * always derived from the IMMUTABLE instance id, never the slug.
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
    resource: { type: 'class' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 }); // boundary
  const { row } = resolved;

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const [subjects, classes, pupils, lessons, adaptationCards] = await Promise.all([
    stub.listSubjects(),
    stub.listClasses(),
    stub.listPupils(),
    stub.listLessons(),
    stub.listAdaptationCards(),
  ]);

  return json({ school: { slug: row.slug, name: row.name }, subjects, classes, pupils, lessons, adaptationCards });
};
