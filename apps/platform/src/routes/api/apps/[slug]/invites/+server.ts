/**
 * Invite CRUD for an app.
 *
 *   GET  /api/apps/[slug]/invites — list active invites
 *   POST /api/apps/[slug]/invites — create a new link invite
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { createLinkInvite, createShortLink, listInvites } from '$server/access/invites';

async function requireOwner(slug: string, userId: string, dbBinding: import('@cloudflare/workers-types').D1Database) {
  const db = getDrizzleClient(dbBinding);
  const [row] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!row) return { error: 'not_found' as const };
  if (row.makerId !== userId) return { error: 'forbidden' as const };
  return { appId: row.id };
}

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'database unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const gate = await requireOwner(event.params.slug!, who.userId, env.DB);
  if ('error' in gate) {
    return json({ error: gate.error }, { status: gate.error === 'forbidden' ? 403 : 404 });
  }

  const invites = await listInvites(gate.appId, env.DB);
  return json({ invites });
};

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const slug = event.params.slug!;
  const gate = await requireOwner(slug, who.userId, env.DB);
  if ('error' in gate) {
    return json({ error: gate.error }, { status: gate.error === 'forbidden' ? 403 : 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const kind = body.kind === 'email' ? 'email' : 'link';
  if (kind === 'email') {
    return json(
      { error: 'not_implemented', reason: 'email invites ship later' },
      { status: 501 },
    );
  }

  const maxUses =
    typeof body.max_uses === 'number' && Number.isInteger(body.max_uses) && body.max_uses > 0
      ? body.max_uses
      : undefined;
  const expiresAt =
    typeof body.expires_at === 'string' && !Number.isNaN(Date.parse(body.expires_at))
      ? body.expires_at
      : undefined;

  const invite = await createLinkInvite({
    appId: gate.appId,
    createdBy: who.userId,
    maxUses,
    expiresAt,
    db: env.DB,
  });

  let shortCode: string | null = null;
  try {
    const short = await createShortLink({ token: invite.token, expiresAt, kv: env.CACHE });
    shortCode = short.code;
  } catch {
    // best-effort
  }

  const host = new URL(env.PUBLIC_ORIGIN ?? 'https://shippie.app').host;
  const proto = (env.PUBLIC_ORIGIN ?? 'https://').startsWith('http://') ? 'http://' : 'https://';
  return json({
    invite,
    url: `${proto}${host}/invite/${invite.token}`,
    short_url: shortCode ? `${proto}${host}/i/${shortCode}` : null,
  });
};
