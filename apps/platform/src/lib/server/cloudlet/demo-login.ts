/**
 * Demo sign-in — "sign in as Sarah Mitchell" (dev / non-prod only).
 *
 * This is BOTH the QA unblocker and a real demo feature: it provisions (once,
 * idempotently) the seeded demo school "St Jude's & St Paul's", grants the
 * demo teacher a verified `teacher` membership, and returns the user id so the
 * caller can mint a Lucia session and land on Today.
 *
 * NEVER call this in production. The login action gates it on
 * `import.meta.env.DEV` (the built production worker has DEV=false) plus a
 * SHIPPIE_ENV guard — this module assumes the caller already gated.
 *
 * Idempotent: re-running reuses the existing instance (matched on the demo
 * slug) and the existing demo user + membership.
 */
import { eq } from 'drizzle-orm';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDrizzleClient, schema } from '$server/db/client';
import { recordAudit } from '$server/admin/audit';
import { createPrivateAppInstance } from './provisioning';
import { assignRole } from './memberships';
import { findOrCreateUserByEmail } from '$server/auth/users';
import type { D1Database } from '@cloudflare/workers-types';
import type { CreatePrivateAppInstanceInput } from '@shippie/cloudlet-contract';

export const DEMO_SLUG = 'st-judes-and-st-paul';
export const DEMO_SCHOOL_NAME = "St Jude's & St Paul's";
export const DEMO_TEACHER_EMAIL = 'sarah.mitchell@stjudes.demo';
export const DEMO_TEACHER_NAME = 'Sarah Mitchell';

const UNITI_APP_SLUG = 'uniti';

/** Find-or-create the Shippie private Uniti app row (apps, visibility='private'). */
async function ensureUnitiApp(
  db: ReturnType<typeof getDrizzleClient>,
  makerId: string,
): Promise<{ appRef: string }> {
  const [existing] = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, UNITI_APP_SLUG))
    .limit(1);
  if (existing) return { appRef: existing.id };

  const id = crypto.randomUUID();
  await db.insert(schema.apps).values({
    id,
    slug: UNITI_APP_SLUG,
    name: 'Uniti',
    type: 'app',
    category: 'education',
    sourceType: 'zip',
    makerId,
    visibilityScope: 'private',
  });
  return { appRef: id };
}

export interface DemoSignInResult {
  userId: string;
  instanceId: string;
  slug: string;
  provisioned: boolean;
}

/**
 * Ensure the demo school + demo teacher exist, then return the demo user id.
 * `schoolWorkspaceNs` is required to provision the per-school DO + seed it.
 */
export async function ensureDemoSignIn(args: {
  d1: D1Database;
  schoolWorkspaceNs: DurableObjectNamespace;
}): Promise<DemoSignInResult> {
  const db = getDrizzleClient(args.d1);

  // 1. Demo teacher user (verified, with a friendly display name).
  const user = await findOrCreateUserByEmail(DEMO_TEACHER_EMAIL, args.d1);
  if (user.display_name !== DEMO_TEACHER_NAME) {
    await args.d1
      .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .bind(DEMO_TEACHER_NAME, new Date().toISOString(), user.id)
      .run();
  }

  // 2. Reuse the existing demo instance if one is already provisioned.
  const [existingInstance] = await db
    .select({ id: schema.privateAppInstances.id })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.slug, DEMO_SLUG))
    .limit(1);

  let instanceId: string;
  let provisioned = false;

  if (existingInstance) {
    instanceId = existingInstance.id;
  } else {
    const input: CreatePrivateAppInstanceInput = {
      appId: 'uniti',
      tenantName: DEMO_SCHOOL_NAME,
      slug: DEMO_SLUG,
      branding: { displayName: DEMO_SCHOOL_NAME },
      ownerEmail: DEMO_TEACHER_EMAIL,
      region: 'uk',
      modules: [],
      dataBoundary: 'dedicated-school-workspace',
    };
    const instance = await createPrivateAppInstance(
      {
        db,
        schoolWorkspaceNs: args.schoolWorkspaceNs,
        recordAudit,
        ensureUnitiApp: (d) => ensureUnitiApp(d, user.id),
        createSpace: async (d, s) => {
          const spaceId = crypto.randomUUID();
          await d.insert(schema.spaces).values({
            id: spaceId,
            name: s.name,
            createdBy: s.createdBy ?? user.id,
          });
          await d.insert(schema.spaceApps).values({
            spaceId,
            appId: s.appRef,
            appSlug: UNITI_APP_SLUG,
          });
          return { spaceId };
        },
        newInstanceId: () => crypto.randomUUID(),
        actorUserId: user.id,
        now: Date.now(),
        seedDemo: true,
      },
      input,
    );
    instanceId = instance.id;
    provisioned = true;
  }

  // 3. Ensure the school's DO actually holds the seed data. `seedDemoSchool`
  //    is idempotent (no-op when pupils already exist), so calling it on every
  //    demo sign-in self-heals an instance whose DO was left unseeded by an
  //    earlier provisioning hiccup, without duplicating data on a healthy one.
  const did = args.schoolWorkspaceNs.idFromName(`uniti:${instanceId}`);
  const stub = args.schoolWorkspaceNs.get(did) as unknown as {
    seedDemoSchool: () => Promise<{ seeded: boolean }>;
  };
  await stub.seedDemoSchool();

  // 4. Grant the demo user a verified `school_admin` membership (idempotent).
  //    The demo persona (Sarah Mitchell, "Year 4 Teacher & SENCO Lead") is the
  //    single account that walks the WHOLE product in a demo — classroom loop
  //    AND leadership/roster/privacy/setup. The membership PK is (instance,user)
  //    so one account holds exactly one role; `school_admin` (RBAC '*') is the
  //    only role that unlocks every screen the demo needs to show.
  await assignRole(db, instanceId, user.id, 'school_admin', { invitedBy: user.id });

  return { userId: user.id, instanceId, slug: DEMO_SLUG, provisioned };
}
