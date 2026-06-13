/**
 * POST /api/handoff — the recipient (laptop) opens a handoff: posts its
 * ECDH public key + the app it wants to continue, gets a rendezvous id to
 * show as a QR/code. Account-scoped: the offer is namespaced by the
 * signed-in user, so only that user's other devices can fulfil it.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import {
  HANDOFF_OFFER_SCHEMA,
  newHandoffId,
  parseHandoffOffer,
  storeHandoffOffer,
} from '$server/handoff/handoff-relay';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.CACHE) throw error(503, 'handoff relay unavailable');
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  // Reuse the shared validator by shaping the body into a full offer first.
  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const offerInput = JSON.stringify({
    schema: HANDOFF_OFFER_SCHEMA,
    recipientPublicKey: body.recipientPublicKey,
    appSlug: body.appSlug,
    deviceLabel: body.deviceLabel,
    createdAt: new Date().toISOString(),
  });

  try {
    const offer = await parseHandoffOffer(new Request('https://x/', { method: 'POST', body: offerInput }));
    const id = newHandoffId();
    const result = await storeHandoffOffer(env, who.userId, id, offer);
    return json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'invalid_offer' }, { status: 400 });
  }
};
