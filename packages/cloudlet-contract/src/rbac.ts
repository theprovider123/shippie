/**
 * RBAC — the reusable Shippie-Private-Cloud authorisation surface.
 *
 * `AuthContext` is the verified caller (instance + user + their roles in
 * that instance). `RBAC.can(ctx, action, resource)` is a pure decision
 * function — no I/O — so it is trivially testable and identical on the
 * server and (eventually) the client.
 *
 * The policy is a small role→scope map. It is product-AGNOSTIC: actions and
 * resource types are plain strings, so a future Shippie private app can add
 * its own actions without changing this contract. Uniti seeds the four MVP
 * roles (teacher, school_admin, leader, office_manager); the interface and
 * the policy map already cover all eight cloudlet roles.
 *
 * Wildcards:
 *   '*'            — any action on any resource (owner / school_admin)
 *   'feedback:*'   — any action whose `${resourceType}:${action}` starts
 *                    with the prefix before '*'
 *   'feedback:read'— an exact `${resourceType}:${action}` grant
 */
import type { Role } from './roles';

/** A verified caller within ONE school instance. */
export interface AuthContext {
  instanceId: string;
  userId: string;
  roles: Role[];
  deviceId?: string;
}

/** The thing being acted on. `type` is a plain string (product-agnostic). */
export interface Resource {
  type: string;
  id?: string;
}

export interface RBAC {
  /** Pure decision — true iff one of `ctx.roles` grants `action` on `resource`. */
  can(ctx: AuthContext, action: string, resource: Resource): boolean;
  assignRole(instanceId: string, userId: string, role: Role): Promise<void>;
  rolesFor(instanceId: string, userId: string): Promise<Role[]>;
}

/**
 * Per-role grant scopes. Each grant is a `${resourceType}:${action}` string,
 * with `*` as a suffix wildcard. `'*'` alone = everything.
 *
 * Uniti MVP intent:
 *  - owner / school_admin — full control of the school instance.
 *  - office_manager       — runs SETUP: invites/manages staff, roster, classes,
 *                           branding, privacy/AI settings. Not classroom data.
 *  - leader               — read-only across the school (rollups, progress) +
 *                           reads adaptations; no member management.
 *  - teacher              — their classroom loop: feedback, adaptations, notes,
 *                           lessons, and read their own pupils/classes.
 *  - teaching_assistant   — capture feedback + read classes (no adaptation edits).
 *  - specialist           — like a teacher but read-only on roster.
 *  - viewer               — read-only, narrow.
 */
export const ROLE_SCOPES: Record<Role, readonly string[]> = {
  owner: ['*'],
  school_admin: ['*'],
  office_manager: [
    'member:*',
    'invite:*',
    'instance:read',
    'instance:update',
    'roster:*',
    'class:*',
    'pupil:*',
    'settings:*',
    'branding:*',
  ],
  leader: [
    'instance:read',
    'rollup:read',
    'progress:read',
    'class:read',
    'pupil:read',
    'adaptation:read',
    'feedback:read',
  ],
  teacher: [
    'instance:read',
    'class:read',
    'pupil:read',
    'lesson:*',
    'feedback:*',
    'adaptation:*',
    'note:*',
    'event:append',
    'event:read',
  ],
  teaching_assistant: [
    'instance:read',
    'class:read',
    'pupil:read',
    'feedback:create',
    'feedback:read',
    'note:create',
    'event:append',
    'event:read',
  ],
  specialist: [
    'instance:read',
    'class:read',
    'pupil:read',
    'lesson:read',
    'feedback:*',
    'adaptation:*',
    'note:*',
    'event:append',
    'event:read',
  ],
  viewer: ['instance:read', 'progress:read', 'class:read'],
};

/** The four MVP roles seeded by Uniti (the interface still supports all eight). */
export const MVP_ROLES: readonly Role[] = ['teacher', 'school_admin', 'leader', 'office_manager'];

function grantMatches(grant: string, want: string): boolean {
  if (grant === '*') return true;
  if (grant.endsWith(':*')) {
    const prefix = grant.slice(0, -1); // keep the trailing ':' → 'feedback:'
    return want.startsWith(prefix);
  }
  return grant === want;
}

/** Does any of `roles` grant `action` on `resource.type`? Pure. */
export function roleCan(roles: Role[], action: string, resource: Resource): boolean {
  const want = `${resource.type}:${action}`;
  for (const role of roles) {
    const scopes = ROLE_SCOPES[role];
    if (!scopes) continue;
    for (const grant of scopes) {
      if (grantMatches(grant, want)) return true;
    }
  }
  return false;
}

/**
 * Build a pure-decision RBAC `can`. The async `assignRole`/`rolesFor` are
 * wired to the membership store by the server (see lib/server/cloudlet/rbac.ts);
 * `can` itself needs no I/O.
 */
export function createRbacDecider(): Pick<RBAC, 'can'> {
  return {
    can: (ctx, action, resource) => roleCan(ctx.roles, action, resource),
  };
}
