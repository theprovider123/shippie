import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';

/**
 * resolveInstanceForUser — the instance boundary guard.
 *
 * Returns the `private_app_instances` row only if the caller is allowed to
 * touch THIS school's workspace; otherwise `null` (the boundary).
 *
 * ⚠️ PHASE-1A-ONLY SHORTCUT — DO NOT SHIP TO REAL SCHOOLS. ⚠️
 * Matching on `ownerEmail` is a temporary stand-in to PROVE the boundary
 * end-to-end in this vertical slice. The real model (Phase 2) requires
 * verified identity (SSO), invites, memberships, and RBAC via
 * `@shippie/access` — an UNVERIFIED email must never grant access to a
 * child-data workspace. This single function is the designated replacement
 * point. See the Phase 1A plan, amendment #5.
 */
export async function resolveInstanceForUser(
  db: any,
  slug: string,
  user: { id: string; email: string; isAdmin: boolean },
) {
  const row = await db.query.privateAppInstances.findFirst({
    where: eq(schema.privateAppInstances.slug, slug),
  });
  if (!row) return null;
  // ⚠️ PHASE-1A-ONLY: ownerEmail match. Replace with verified identity +
  // invites + memberships + RBAC (@shippie/access) before any real school.
  if (user.isAdmin || row.ownerEmail.toLowerCase() === user.email.toLowerCase()) return row;
  return null; // boundary: not your instance
}
