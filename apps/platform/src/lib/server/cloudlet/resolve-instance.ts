import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';
import { authContextFor } from './rbac';
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
  if (user.isAdmin) {
    return { row, ctx: { instanceId: row.id, userId: user.id, roles: ['owner'] } };
  }

  // Verified membership → roles in this instance.
  const ctx = await authContextFor(db, row.id, user.id);
  if (ctx.roles.length === 0) return null; // not a member: boundary

  const need = require ?? { action: 'read', resource: { type: 'instance' } };
  if (!roleCan(ctx.roles, need.action, need.resource)) return null; // member, but lacks capability

  return { row, ctx };
}
