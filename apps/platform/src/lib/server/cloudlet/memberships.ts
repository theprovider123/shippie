/**
 * Cloudlet memberships — the verified link between a Lucia user and a school
 * instance, with a role. This is the Phase-2 data model that replaces the
 * Phase-1A ownerEmail shortcut.
 *
 * `membershipsFor(db, instanceId, userId)` is the canonical lookup; RBAC and
 * the instance boundary guard both build on it.
 */
import { and, eq } from 'drizzle-orm';
import type { Role } from '@shippie/cloudlet-contract';
import { schema } from '$server/db/client';
import type { CloudletMembershipRow } from '$server/db/schema/cloudlet-memberships';

// `db` is typed loosely (drizzle client) to stay test-friendly; the real
// caller passes getDrizzleClient(env.DB).
type Db = any;

/** All membership rows a user holds in one school instance (usually 0 or 1). */
export async function membershipsFor(
  db: Db,
  instanceId: string,
  userId: string,
): Promise<CloudletMembershipRow[]> {
  return db
    .select()
    .from(schema.cloudletMemberships)
    .where(
      and(
        eq(schema.cloudletMemberships.instanceId, instanceId),
        eq(schema.cloudletMemberships.userId, userId),
      ),
    );
}

/** The roles a user holds in one school instance. */
export async function rolesFor(db: Db, instanceId: string, userId: string): Promise<Role[]> {
  const rows = await membershipsFor(db, instanceId, userId);
  return rows.map((r) => r.role as Role);
}

/**
 * Idempotently grant `role` to `userId` in `instanceId`. Upsert on the
 * (instance_id, user_id) PK so re-assigning replaces the role rather than
 * erroring on conflict.
 */
export async function assignRole(
  db: Db,
  instanceId: string,
  userId: string,
  role: Role,
  opts: { invitedBy?: string | null; scope?: { classIds?: string[] } | null } = {},
): Promise<void> {
  await db
    .insert(schema.cloudletMemberships)
    .values({
      instanceId,
      userId,
      role,
      scope: opts.scope ?? null,
      invitedBy: opts.invitedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.cloudletMemberships.instanceId, schema.cloudletMemberships.userId],
      set: { role, scope: opts.scope ?? null },
    });
}

/** All members of a school instance (for the staff list in setup). */
export async function membersOfInstance(
  db: Db,
  instanceId: string,
): Promise<CloudletMembershipRow[]> {
  return db
    .select()
    .from(schema.cloudletMemberships)
    .where(eq(schema.cloudletMemberships.instanceId, instanceId));
}
