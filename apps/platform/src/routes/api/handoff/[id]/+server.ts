/**
 * GET /api/handoff/[id] — the sender (phone) reads the pending offer for
 * this rendezvous so it knows which app to package and which public key
 * to encrypt to. Account-scoped: only the same signed-in user can read it.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { isHandoffId, readHandoffOffer } from '$server/handoff/handoff-relay';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.CACHE) throw error(503, 'handoff relay unavailable');
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
  if (!isHandoffId(event.params.id)) return json({ error: 'invalid_id' }, { status: 400 });

  const offer = await readHandoffOffer(env, who.userId, event.params.id);
  if (!offer) return json({ error: 'not_found' }, { status: 404 });
  return json(offer, { headers: { 'cache-control': 'no-store' } });
};
