/**
 * /api/cloudlet/instances
 *
 * POST  — (admin only) provision a new Uniti school instance: find-or-create
 *         the Shippie private Uniti app, create a space install record, write
 *         the control-plane row, stand up the per-school SchoolWorkspace DO,
 *         and audit.
 * GET   — (admin only) list provisioned instances (control-plane metadata).
 *
 * Auth mirrors `api/deploy/+server.ts` (resolveRequestUserId, platform.env,
 * json()). Admin gating uses `event.locals.user.isAdmin`.
 */
import { json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { recordAudit } from '$server/admin/audit';
import { createPrivateAppInstance } from '$server/cloudlet/provisioning';
import type { CreatePrivateAppInstanceInput } from '@shippie/cloudlet-contract';

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

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ error: 'platform bindings unavailable' }, { status: 500 });
  if (!env.SCHOOL_WORKSPACE) {
    return json({ error: 'school_workspace_binding_unavailable' }, { status: 500 });
  }

  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });
  if (!user.isAdmin) return json({ error: 'forbidden' }, { status: 403 });

  let body: Partial<CreatePrivateAppInstanceInput>;
  try {
    body = (await event.request.json()) as Partial<CreatePrivateAppInstanceInput>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const tenantName = String(body.tenantName ?? '').trim();
  const slug = String(body.slug ?? '').trim();
  const ownerEmail = String(body.ownerEmail ?? '').trim();
  if (!tenantName || !slug || !ownerEmail) {
    return json({ error: 'missing_fields', required: ['tenantName', 'slug', 'ownerEmail'] }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);

  const input: CreatePrivateAppInstanceInput = {
    appId: 'uniti',
    tenantName,
    slug,
    branding: body.branding ?? { displayName: tenantName },
    ownerEmail,
    region: body.region ?? 'uk',
    modules: Array.isArray(body.modules) ? body.modules : [],
    dataBoundary: 'dedicated-school-workspace',
  };

  try {
    const instance = await createPrivateAppInstance(
      {
        db,
        schoolWorkspaceNs: env.SCHOOL_WORKSPACE,
        recordAudit,
        ensureUnitiApp: (d) => ensureUnitiApp(d, user.id),
        // Create a Shippie space + space_apps install record for the school.
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
      },
      input,
    );
    return json({ instance }, { status: 201 });
  } catch (err) {
    console.error('[cloudlet:provision] error', err);
    // Most likely a UNIQUE violation on slug.
    return json(
      { error: 'provision_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
};

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ error: 'platform bindings unavailable' }, { status: 500 });

  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });
  if (!user.isAdmin) return json({ error: 'forbidden' }, { status: 403 });

  const db = getDrizzleClient(env.DB);
  const rows = await db
    .select()
    .from(schema.privateAppInstances)
    .orderBy(desc(schema.privateAppInstances.createdAt));
  return json({ instances: rows });
};
