/**
 * POST /api/handoff/[id]/bundle — sender (phone) deposits the encrypted
 * snapshot for a pending handoff.
 * GET  /api/handoff/[id]/bundle — recipient (laptop) polls; the bundle is
 * consumed (deleted) on first read so the snapshot never lingers in KV.
 * Both account-scoped to the signed-in user.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import {
  consumeHandoffBundle,
  isHandoffId,
  parseHandoffBundle,
  storeHandoffBundle,
} from '$server/handoff/handoff-relay';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.CACHE) throw error(503, 'handoff relay unavailable');
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
  if (!isHandoffId(event.params.id)) return json({ error: 'invalid_id' }, { status: 400 });

  try {
    const bundle = await parseHandoffBundle(event.request);
    const result = await storeHandoffBundle(env, who.userId, event.params.id, bundle);
    return json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_bundle';
    const status = message.includes('too large') ? 413 : message.includes('no pending') ? 409 : 400;
    return json({ error: message }, { status });
  }
};

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.CACHE) throw error(503, 'handoff relay unavailable');
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
  if (!isHandoffId(event.params.id)) return json({ error: 'invalid_id' }, { status: 400 });

  const bundle = await consumeHandoffBundle(env, who.userId, event.params.id);
  if (!bundle) return json({ pending: true }, { status: 202, headers: { 'cache-control': 'no-store' } });
  return json(bundle, { headers: { 'cache-control': 'no-store' } });
};
