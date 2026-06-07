/**
 * Server RBAC — binds the pure, reusable decider from
 * `@shippie/cloudlet-contract` to the membership store (cloudlet_memberships).
 *
 * `can()` stays a pure synchronous decision over the caller's roles; the async
 * `rolesFor`/`assignRole` read/write the store. `authContextFor()` is the
 * bridge a route uses to turn (instanceId, userId) into an AuthContext before
 * calling `can()`.
 */
import {
  createRbacDecider,
  type AuthContext,
  type RBAC,
  type Role,
} from '@shippie/cloudlet-contract';
import { assignRole as storeAssignRole, rolesFor as storeRolesFor } from './memberships';

type Db = any;

export function createServerRbac(db: Db): RBAC {
  const decider = createRbacDecider();
  return {
    can: decider.can,
    rolesFor: (instanceId, userId) => storeRolesFor(db, instanceId, userId),
    assignRole: (instanceId, userId, role) => storeAssignRole(db, instanceId, userId, role),
  };
}

/**
 * Resolve the caller's roles in an instance into an AuthContext. A user with
 * no membership comes back with `roles: []` — `RBAC.can` then denies
 * everything, which is the correct default (no access without a verified
 * membership).
 */
export async function authContextFor(
  db: Db,
  instanceId: string,
  userId: string,
  deviceId?: string,
): Promise<AuthContext> {
  const roles = await storeRolesFor(db, instanceId, userId);
  return { instanceId, userId, roles, deviceId };
}

export type { AuthContext, Role };
