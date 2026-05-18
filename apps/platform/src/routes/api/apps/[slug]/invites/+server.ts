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
import {
  appendSignedPrivateSpaceCapability,
  privateSpaceCapabilityFromValues,
} from '$server/invites/private-space-capability';
import { transferIdFromValue } from '$server/invites/private-join';
import { ensureSpaceForApp, recordSpaceJoinToken } from '$server/spaces/private-spaces';

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

  const requestedSpaceId = stringBody(body.space_id) ?? stringBody(body.space);
  const requestedSpaceRole = stringBody(body.space_role) ?? stringBody(body.role);
  const requestedJoinToken = stringBody(body.space_join) ?? stringBody(body.join_token);
  const requestedTransferId = stringBody(body.transfer_id) ?? stringBody(body.transfer);
  const hasSpaceField = Boolean(requestedSpaceId || requestedSpaceRole || requestedJoinToken || requestedTransferId);
  const isSpaceInvite = Boolean(requestedSpaceId && requestedSpaceRole && requestedJoinToken);
  if (hasSpaceField && !isSpaceInvite) {
    return json(
      { error: 'invalid_space_invite', reason: 'space_id, space_role, and space_join are required together; transfer_id is optional only with a space invite' },
      { status: 400 },
    );
  }
  const requestedCapability = isSpaceInvite
    ? privateSpaceCapabilityFromValues({
        appSlug: slug,
        inviteToken: 'pending',
        spaceId: requestedSpaceId,
        role: requestedSpaceRole,
        joinToken: requestedJoinToken,
        transferId: requestedTransferId,
      })
    : null;
  if (isSpaceInvite && !requestedCapability) {
    return json({ error: 'invalid_space_invite', reason: 'space invite values are malformed' }, { status: 400 });
  }
  if (requestedTransferId && !transferIdFromValue(requestedTransferId)) {
    return json({ error: 'invalid_transfer', reason: 'transfer_id must be a Shippie transfer code' }, { status: 400 });
  }
  const inviteSecret = env.INVITE_SECRET ?? env.AUTH_SECRET;
  if (isSpaceInvite && !inviteSecret) {
    return json({ error: 'invite_signing_secret_missing' }, { status: 500 });
  }

  let maxUses: number | undefined;
  if (body.max_uses != null) {
    if (typeof body.max_uses !== 'number' || !Number.isInteger(body.max_uses) || body.max_uses < 1 || body.max_uses > 500) {
      return json({ error: 'invalid_max_uses', reason: 'max_uses must be a whole number between 1 and 500' }, { status: 400 });
    }
    maxUses = body.max_uses;
  }
  if (isSpaceInvite && maxUses == null) maxUses = 20;
  let expiresAt: string | undefined;
  if (body.expires_at != null) {
    if (typeof body.expires_at !== 'string' || Number.isNaN(Date.parse(body.expires_at))) {
      return json({ error: 'invalid_expires_at', reason: 'expires_at must be an ISO date string' }, { status: 400 });
    }
    expiresAt = body.expires_at;
  }

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
  let longUrl = `${proto}${host}/invite/${invite.token}`;
  let shortUrl = shortCode ? `${proto}${host}/i/${shortCode}` : null;
  const capability = privateSpaceCapabilityFromValues({
    appSlug: slug,
    inviteToken: invite.token,
    spaceId: requestedCapability?.spaceId,
    role: requestedCapability?.role,
    joinToken: requestedCapability?.joinToken,
    transferId: requestedCapability?.transferId,
  });
  if (capability) {
    await ensureSpaceForApp({
      db: env.DB,
      spaceId: capability.spaceId,
      appId: gate.appId,
      appSlug: slug,
      createdBy: who.userId,
      name: stringBody(body.space_name),
      packageHash: stringBody(body.package_hash),
    });
    await recordSpaceJoinToken({
      db: env.DB,
      spaceId: capability.spaceId,
      appId: gate.appId,
      inviteId: invite.id,
      joinToken: capability.joinToken,
      role: capability.role,
      maxClaims: maxUses ?? null,
      expiresAt: expiresAt ?? null,
      createdBy: who.userId,
      rotatedFrom: stringBody(body.rotated_from),
    });
    longUrl = await appendSignedPrivateSpaceCapability(longUrl, inviteSecret!, capability);
    if (shortUrl) shortUrl = await appendSignedPrivateSpaceCapability(shortUrl, inviteSecret!, capability);
  }

  return json({
    invite,
    url: longUrl,
    short_url: shortUrl,
  });
};

function stringBody(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
