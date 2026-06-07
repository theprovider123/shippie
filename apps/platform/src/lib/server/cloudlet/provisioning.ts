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
import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';
import type {
  CreatePrivateAppInstanceInput,
  ExportManifest,
  PrivateAppInstance,
} from '@shippie/cloudlet-contract';

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
  /** Seed the prototype demo school into the DO after provisioning (Phase 3).
   * Defaults to true; the Phase-1A provisioning test sets it false to keep its
   * DO stub minimal. */
  seedDemo?: boolean;
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
  // Seed the prototype demo data (classes/pupils/lessons/feedback/adaptation
  // cards) so the school is immediately demoable without a real MIS sync
  // (Phase 3). Idempotent on the DO side. Best-effort.
  if (deps.seedDemo !== false) {
    await (stub as unknown as { seedDemoSchool: () => Promise<unknown> }).seedDemoSchool();
  }
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

// ── Deprovisioning — the data-owner boundary, provable (Phase 9) ─────────────

export interface DeprovisionDeps {
  db: any;
  schoolWorkspaceNs: DurableObjectNamespace;
  recordAudit: ProvisionDeps['recordAudit'];
  actorUserId: string | null;
  now: number;
}

/**
 * Minimal DO surface deprovision needs (export reads everything; erase purges).
 */
interface DeprovisionStub {
  buildExport: () => Promise<unknown>;
  eraseAll: () => Promise<{ events: number; feedback: number; pupils: number }>;
}

/**
 * deprovision(instanceId, mode) — the school's right to take its data and leave.
 *
 *   mode='export' — build the full school-owned export from the school's DO and
 *     return a manifest. NON-destructive; the workspace is untouched.
 *
 *   mode='erase'  — PURGE the school: wipe the SchoolWorkspace DO's SQLite +
 *     all DO storage (`eraseAll` → `ctx.storage.deleteAll()`), remove the
 *     `space_apps` install record (the school no longer appears as an installed
 *     app), and mark the control-plane row `erased_at` (KEPT as a tombstone so
 *     the erasure is provable). The erasure itself is audited on the platform
 *     audit log BEFORE + AFTER the destructive step.
 *
 * Returns an `ExportManifest` either way (for 'erase' it records what was
 * purged, with `files: []`). Pure-ish: all I/O is via injected deps + the DO ns.
 */
export async function deprovision(
  deps: DeprovisionDeps,
  instanceId: string,
  mode: 'export' | 'erase',
): Promise<ExportManifest> {
  const row = await deps.db.query.privateAppInstances.findFirst({
    where: eq(schema.privateAppInstances.id, instanceId),
  });
  if (!row) throw new Error(`instance not found: ${instanceId}`);

  const stub = deps.schoolWorkspaceNs.get(
    deps.schoolWorkspaceNs.idFromName(`uniti:${instanceId}`),
  ) as unknown as DeprovisionStub;

  if (mode === 'export') {
    const data = await stub.buildExport();
    await deps.recordAudit(deps.db, {
      actorUserId: deps.actorUserId,
      action: 'private_app_instance.exported',
      targetTable: 'private_app_instances',
      targetId: instanceId,
      after: { mode },
    });
    return {
      instanceId,
      files: [`uniti-${row.slug}-export.json`],
      generatedAt: new Date(deps.now).toISOString(),
      // The full export payload travels inline (the route streams it to the
      // owner). `files` names the logical artifact.
      ...(data ? { data } : {}),
    } as ExportManifest & { data?: unknown };
  }

  // mode === 'erase'
  await deps.recordAudit(deps.db, {
    actorUserId: deps.actorUserId,
    action: 'private_app_instance.erase_started',
    targetTable: 'private_app_instances',
    targetId: instanceId,
    after: { mode, slug: row.slug },
  });

  const purged = await stub.eraseAll(); // wipes DO SQLite + all DO storage

  // Remove the install record(s) so the school no longer appears as installed.
  await deps.db.delete(schema.spaceApps).where(eq(schema.spaceApps.spaceId, row.spaceId));

  // Mark the control-plane row erased (KEEP it — the tombstone proves the
  // boundary; no pupil data ever lived here).
  await deps.db
    .update(schema.privateAppInstances)
    .set({ erasedAt: deps.now })
    .where(eq(schema.privateAppInstances.id, instanceId));

  await deps.recordAudit(deps.db, {
    actorUserId: deps.actorUserId,
    action: 'private_app_instance.erased',
    targetTable: 'private_app_instances',
    targetId: instanceId,
    after: { mode, purged },
  });

  return {
    instanceId,
    files: [],
    generatedAt: new Date(deps.now).toISOString(),
  };
}
