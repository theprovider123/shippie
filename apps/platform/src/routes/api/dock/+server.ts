/**
 * GET  /api/dock          → { saved: string[], removed: string[] } for the
 *                           signed-in account (cross-device dock mirror).
 * POST /api/dock { slug, action: 'save' | 'remove' } → mirror one change.
 *
 * The client writes localStorage first (instant + offline) and calls this
 * fire-and-forget; a fresh device hydrates `saved` on load. Anonymous
 * callers get 401 and the dock stays purely local — no behaviour change.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient } from '$server/db/client';
import { APP_SLUG_RE } from '$server/apps/slug-availability';
import { canonicalShowcaseSlug } from '$lib/showcase-slugs';
import { listAccountDock, setAccountDockEntry } from '$server/dock/account-dock';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ saved: [], removed: [] });
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
  const db = getDrizzleClient(env.DB);
  const state = await listAccountDock(db, who.userId);
  return json(state, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'platform bindings unavailable');
  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const rawSlug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const slug = canonicalShowcaseSlug(rawSlug);
  const action = body.action === 'remove' ? 'remove' : body.action === 'save' ? 'save' : null;
  if (!slug || !APP_SLUG_RE.test(slug) || !action) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);
  await setAccountDockEntry(db, who.userId, slug, action);
  return json({ ok: true, slug, action });
};
