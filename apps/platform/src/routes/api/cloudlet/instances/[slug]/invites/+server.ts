/**
 * /api/cloudlet/instances/[slug]/invites
 *
 * POST — (members with `invite:create` — office_manager / admin) invite a staff
 *        member by email with a role, and return the raw token + accept link.
 * GET  — list this school's members + pending invites (requires `member:read`).
 *
 * Access is resolved through the membership+RBAC boundary guard. The raw invite
 * token is returned ONCE so the office manager can share the link; only its
 * hash is stored.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { recordAudit } from '$server/admin/audit';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { createInviteSystem, wireInviteStore } from '$server/cloudlet/invites';
import { membersOfInstance } from '$server/cloudlet/memberships';
import { ROLES, type Role } from '@shippie/cloudlet-contract';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ error: 'platform bindings unavailable' }, { status: 500 });
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'create',
    resource: { type: 'invite' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });

  let body: { email?: string; role?: string; classIds?: string[] };
  try {
    body = (await event.request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '') as Role;
  if (!email || !email.includes('@')) return json({ error: 'invalid_email' }, { status: 400 });
  if (!ROLES.includes(role)) return json({ error: 'invalid_role', allowed: ROLES }, { status: 400 });

  const invites = createInviteSystem({
    store: wireInviteStore(db),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    newToken: () =>
      crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
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

  const scope = Array.isArray(body.classIds) && body.classIds.length ? { classIds: body.classIds } : undefined;
  const invite = await invites.invite(resolved.row.id, email, role, scope);

  const origin = env.PUBLIC_ORIGIN ?? event.url.origin;
  const acceptUrl = new URL(
    `/uniti/join/${encodeURIComponent(invite.token ?? '')}`,
    origin.replace(/\/$/, ''),
  ).toString();

  return json(
    { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, acceptUrl },
    { status: 201 },
  );
};

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ error: 'platform bindings unavailable' }, { status: 500 });
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'read',
    resource: { type: 'member' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });

  const members = await membersOfInstance(db, resolved.row.id);
  const pending = await db
    .select({
      id: schema.cloudletInvites.id,
      email: schema.cloudletInvites.email,
      role: schema.cloudletInvites.role,
      expiresAt: schema.cloudletInvites.expiresAt,
      acceptedAt: schema.cloudletInvites.acceptedAt,
      revokedAt: schema.cloudletInvites.revokedAt,
    })
    .from(schema.cloudletInvites)
    .where(eq(schema.cloudletInvites.instanceId, resolved.row.id));

  return json({
    members: members.map((m) => ({ userId: m.userId, role: m.role, joinedAt: m.joinedAt })),
    invites: pending.filter((p) => !p.acceptedAt && !p.revokedAt),
  });
};
