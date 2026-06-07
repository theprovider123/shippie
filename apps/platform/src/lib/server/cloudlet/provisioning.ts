/**
 * createPrivateAppInstance — provision one Uniti school instance.
 *
 * What "provisioning" means here (the reusable Shippie-Private-Cloud
 * pattern proven on ONE school):
 *   1. Mint an IMMUTABLE instance id (UUID) — the data-boundary identity.
 *      NEVER the slug (slugs are mutable friendly aliases).
 *   2. Reference the Shippie private app row (`apps`, visibility='private')
 *      via `ensureUnitiApp` — so this is a private app installed THROUGH
 *      Shippie, not a standalone route (amendment #6).
 *   3. Create a Shippie space + space_apps install record for the school
 *      via `createSpace`.
 *   4. Write the control-plane row (`private_app_instances`) — metadata
 *      only, no pupil data.
 *   5. Stand up the per-school SchoolWorkspace DO (deriving its id from the
 *      immutable instance id) and force its `init()`.
 *   6. Record a platform audit entry.
 *
 * Dependency-injected so it's deterministic + unit-testable: `now` and
 * `newInstanceId` are passed in (no `Date.now()` / `crypto` inside the
 * pure function). The route wires the real deps.
 */
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { schema } from '$server/db/client';
import type { CreatePrivateAppInstanceInput, PrivateAppInstance } from '@shippie/cloudlet-contract';

export interface ProvisionDeps {
  // drizzle client (getDrizzleClient(env.DB))
  db: any;
  schoolWorkspaceNs: DurableObjectNamespace;
  recordAudit: (
    db: any,
    e: {
      actorUserId: string | null;
      action: string;
      targetTable: string;
      targetId: string | null;
      after?: Record<string, unknown> | null;
    },
  ) => Promise<unknown>;
  // Shippie private-app model (amendment #6) — route binds these to
  // apps / spaces / space_apps:
  /** idempotent: apps row slug='uniti', visibilityScope='private' */
  ensureUnitiApp: (db: any) => Promise<{ appRef: string }>;
  /** spaces + space_apps install record */
  createSpace: (
    db: any,
    s: { name: string; createdBy: string | null; appRef: string },
  ) => Promise<{ spaceId: string }>;
  /** IMMUTABLE UUID (route: crypto.randomUUID()) */
  newInstanceId: () => string;
  actorUserId: string | null;
  /** unix ms (route passes Date.now()) */
  now: number;
  /**
   * Seed the office-manager access for `ownerEmail` (Phase 2). The route wires
   * this to: create a verified membership if a user already exists for that
   * email, else mint a pending office_manager invite. Optional so the Phase-1A
   * provisioning test (which doesn't exercise membership) stays unchanged.
   */
  seedOwnerMembership?: (args: {
    db: any;
    instanceId: string;
    ownerEmail: string;
  }) => Promise<{ via: 'membership' | 'invite'; inviteToken?: string }>;
}

export async function createPrivateAppInstance(
  deps: ProvisionDeps,
  input: CreatePrivateAppInstanceInput,
): Promise<PrivateAppInstance> {
  const id = deps.newInstanceId(); // IMMUTABLE identity — NEVER the slug
  const { appRef } = await deps.ensureUnitiApp(deps.db); // reference the Shippie private app
  const { spaceId } = await deps.createSpace(deps.db, {
    name: input.tenantName,
    createdBy: deps.actorUserId,
    appRef,
  }); // Shippie install record
  // DO derives from the immutable id, not the slug.
  const doId = deps.schoolWorkspaceNs.idFromName(`uniti:${id}`).toString();
  const row = {
    id,
    appId: input.appId,
    appRef,
    spaceId,
    slug: input.slug,
    name: input.tenantName,
    region: input.region,
    branding: input.branding,
    ownerEmail: input.ownerEmail,
    modules: input.modules,
    workspaceDoId: doId,
    createdBy: deps.actorUserId,
    createdAt: deps.now,
  };
  await deps.db.insert(schema.privateAppInstances).values(row);
  // Init the DO workspace — constructing the stub + first RPC creates the
  // embedded SQLite (init() runs in the DO constructor).
  const stub = deps.schoolWorkspaceNs.get(deps.schoolWorkspaceNs.idFromName(`uniti:${id}`));
  await (stub as unknown as { listEvents: () => Promise<unknown> }).listEvents(); // forces DO construction + init()
  // Seed the office-manager access (Phase 2): membership if the user exists,
  // otherwise a pending office_manager invite. Best-effort — provisioning
  // already succeeded by this point.
  if (deps.seedOwnerMembership) {
    await deps.seedOwnerMembership({ db: deps.db, instanceId: id, ownerEmail: input.ownerEmail });
  }
  await deps.recordAudit(deps.db, {
    actorUserId: deps.actorUserId,
    action: 'private_app_instance.created',
    targetTable: 'private_app_instances',
    targetId: id,
    after: { slug: input.slug, spaceId, appRef },
  });
  return {
    id,
    appId: input.appId,
    appRef,
    spaceId,
    slug: input.slug,
    name: input.tenantName,
    region: input.region,
    branding: input.branding,
    ownerEmail: input.ownerEmail,
    modules: input.modules,
    workspaceDoId: doId,
    createdAt: new Date(deps.now).toISOString(),
  };
}
