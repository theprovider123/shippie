import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';
import { authContextFor } from './rbac';
import { membershipsFor } from './memberships';
import { recordBreakGlass } from './compliance-view';
import { roleCan, type AuthContext, type Resource } from '@shippie/cloudlet-contract';

/**
 * resolveInstanceForUser — the instance boundary guard (Phase 2).
 *
 * Returns the `private_app_instances` row + the caller's AuthContext (their
 * verified roles in THIS school) only if the caller may touch the workspace;
 * otherwise `null` (the boundary).
 *
 * Access is granted by a VERIFIED membership (cloudlet_memberships) resolved
 * via RBAC — NOT by an unverified ownerEmail match. This is the Phase-2
 * security fix the plan flags: an unverified email must never grant access to
 * a child-data workspace. Platform admins are still allowed (operations).
 *
 * Optional `require` lets a route demand a specific action; when omitted we
 * require the baseline `instance:read` capability (held by every role with
 * workspace access). A non-member resolves to roles:[] → RBAC denies → null.
 */
export interface ResolvedInstance {
  row: typeof schema.privateAppInstances.$inferSelect;
  ctx: AuthContext;
}

export async function resolveInstanceForUser(
  db: any,
  slug: string,
  user: { id: string; email: string; isAdmin: boolean },
  require?: { action: string; resource: Resource },
): Promise<ResolvedInstance | null> {
  const row = await db.query.privateAppInstances.findFirst({
    where: eq(schema.privateAppInstances.slug, slug),
  });
  if (!row) return null;

  // Platform admins keep operational access (own everything in the instance).
  // BUT if the admin is NOT a verified member of this school, this is a
  // BREAK-GLASS access to pupil data — audit it so it is visible on the
  // school's Privacy & data screen (Phase 9). A member-admin (e.g. the school's
  // own owner who also happens to be a platform admin) is not break-glass.
  if (user.isAdmin) {
    const own = await membershipsFor(db, row.id, user.id);
    if (own.length === 0) {
      try {
        await recordBreakGlass(db, {
          actorUserId: user.id,
          instanceId: row.id,
          reason: 'platform_admin_access',
          resource: require ? `${require.resource.type}:${require.action}` : 'instance:read',
        });
      } catch {
        // Best-effort — never block operational access on the audit write.
      }
    }
    return { row, ctx: { instanceId: row.id, userId: user.id, roles: ['owner'] } };
  }

  // Verified membership → roles in this instance.
  const ctx = await authContextFor(db, row.id, user.id);
  if (ctx.roles.length === 0) return null; // not a member: boundary

  const need = require ?? { action: 'read', resource: { type: 'instance' } };
  if (!roleCan(ctx.roles, need.action, need.resource)) return null; // member, but lacks capability

  return { row, ctx };
}
