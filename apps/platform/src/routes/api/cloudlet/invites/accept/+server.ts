/**
 * /api/cloudlet/invites/accept
 *
 * POST { token } — a signed-in user redeems an invite token, creating their
 * verified membership in the school. Single-use; rejects expired/revoked/used.
 *
 * The user MUST be signed in (verified identity via Lucia) — this is the whole
 * point of the Phase-2 model: a membership is only ever created against a
 * verified identity, never an unverified email.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { recordAudit } from '$server/admin/audit';
import { createInviteSystem, wireInviteStore } from '$server/cloudlet/invites';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ error: 'platform bindings unavailable' }, { status: 500 });
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  let body: { token?: string };
  try {
    body = (await event.request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'missing_token' }, { status: 400 });

  const db = getDrizzleClient(env.DB);
  const invites = createInviteSystem({
    store: wireInviteStore(db),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    newToken: () => crypto.randomUUID(),
    actorUserId: user.id,
    recordAudit: async (e) => {
      await recordAudit(db, {
        actorUserId: e.actorUserId,
        action: e.action,
        targetTable: 'cloudlet_invites',
        targetId: e.targetId,
        after: e.after,
      });
    },
  });

  try {
    const membership = await invites.accept(token, { userId: user.id, email: user.email });
    return json({ membership }, { status: 200 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid_invite';
    return json({ error: reason }, { status: 400 });
  }
};
