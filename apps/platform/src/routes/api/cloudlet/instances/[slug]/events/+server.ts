/**
 * /api/cloudlet/instances/[slug]/events
 *
 * POST — append ONE WorkspaceEvent to THIS school's workspace DO only.
 * GET  — list this school's events (scoped).
 *
 * The boundary: both verbs resolve the caller through
 * `resolveInstanceForUser` (Phase-1A owner/admin check); a caller who is
 * neither the owner nor an admin gets 403. The DO stub is ALWAYS derived
 * from the IMMUTABLE instance id (`uniti:${row.id}`) — never the slug, which
 * is a mutable alias and must not be the data boundary.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

type WorkspaceStub = {
  appendEvent: (e: WorkspaceEvent) => Promise<{ accepted: boolean }>;
  listEvents: () => Promise<Array<WorkspaceEvent & { receivedAt: number }>>;
};

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const row = await resolveInstanceForUser(db, event.params.slug, user);
  if (!row) return json({ error: 'forbidden' }, { status: 403 }); // boundary

  let body: Partial<WorkspaceEvent>;
  try {
    body = (await event.request.json()) as Partial<WorkspaceEvent>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.clientEventId || !body.type) {
    return json({ error: 'missing_fields', required: ['clientEventId', 'type'] }, { status: 400 });
  }

  // instanceId is set server-side from the resolved (immutable) row id — the
  // client never picks which workspace it writes to.
  const evt: WorkspaceEvent = {
    clientEventId: String(body.clientEventId),
    type: String(body.type),
    instanceId: row.id,
    actorUserId: user.id,
    deviceId: String(body.deviceId ?? 'web'),
    createdOfflineAt: String(body.createdOfflineAt ?? new Date().toISOString()),
    schemaVersion: typeof body.schemaVersion === 'number' ? body.schemaVersion : 1,
    payload: body.payload ?? {},
  };

  // DO stub derived from the IMMUTABLE id, never the slug.
  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
  const result = await stub.appendEvent(evt);
  return json({ result }, { status: result.accepted ? 201 : 200 });
};

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const row = await resolveInstanceForUser(db, event.params.slug, user);
  if (!row) return json({ error: 'forbidden' }, { status: 403 }); // boundary

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
  const events = await stub.listEvents();
  return json({ events });
};
