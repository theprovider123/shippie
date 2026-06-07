/**
 * /uniti/privacy — Privacy & data (Phase 9, the compliance + trust screen).
 *
 * Ties the data-owner boundary together for owner / school_admin:
 *   - the data-boundary statement,
 *   - export (link to the streaming endpoint),
 *   - retention settings (read/write),
 *   - AI consent: AI on/off + sensitivity (the per-school setting),
 *   - the AI audit log (what was sent, when, model, cached, pseudonymised),
 *   - the break-glass access log (any admin access to pupil data),
 *   - erasure (per-pupil + whole-school, with a typed confirmation).
 *
 * Gated on RBAC `settings:read` (owner / school_admin / office_manager).
 * The full-school ERASE action additionally requires owner-class on POST
 * (enforced by the /erase route, not here).
 */
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';
import { loadComplianceView } from '$server/cloudlet/compliance-view';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/uniti/login?return_to=/uniti/privacy');
  const env = platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) throw error(500, 'platform bindings unavailable');

  const db = getDrizzleClient(env.DB);
  const memberships = await db
    .select({
      instanceId: schema.cloudletMemberships.instanceId,
      role: schema.cloudletMemberships.role,
    })
    .from(schema.cloudletMemberships)
    .where(eq(schema.cloudletMemberships.userId, user.id));

  let instanceId = memberships[0]?.instanceId ?? null;
  let roles = memberships.map((m) => m.role as Role);
  if (!instanceId && user.isAdmin) {
    const recent = await db
      .select({ id: schema.privateAppInstances.id })
      .from(schema.privateAppInstances)
      .limit(1);
    instanceId = recent[0]?.id ?? null;
    roles = instanceId ? (['owner'] as Role[]) : [];
  }
  if (!instanceId) throw redirect(307, '/uniti');

  // settings:read — owner / school_admin / office_manager (the data-controllers).
  const canManage =
    user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'settings' }));
  if (!canManage) throw error(403, 'forbidden');
  // Only an owner / school_admin (the 'delete' on 'instance' wildcard) may run a
  // whole-school erase — gate the destructive UI on this.
  const canEraseSchool =
    user.isAdmin || roles.some((r) => roleCan([r], 'delete', { type: 'instance' }));

  const inst = await db
    .select({
      slug: schema.privateAppInstances.slug,
      name: schema.privateAppInstances.name,
      region: schema.privateAppInstances.region,
    })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const [aiSetting, settings, tombstones, pupils, compliance] = await Promise.all([
    stub.getAiSetting(),
    stub.listSettings(),
    stub.listTombstones(),
    stub.listPupils(),
    loadComplianceView(db, instanceId, 200),
  ]);

  const retentionNotesMonths =
    Number(settings.find((s) => s.key === 'retention_notes_months')?.value ?? 0) || 0;

  return {
    slug: inst[0]?.slug ?? '',
    schoolName: inst[0]?.name ?? '',
    region: inst[0]?.region ?? 'uk',
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Admin' },
    canEraseSchool,
    ai: aiSetting,
    retentionNotesMonths,
    tombstones,
    pupils: pupils.map((p) => ({ id: p.id, name: p.name })),
    aiAudit: compliance.ai.slice(0, 50),
    breakGlass: compliance.breakGlass.slice(0, 50),
    dataEvents: compliance.dataEvents.slice(0, 50),
  };
};
