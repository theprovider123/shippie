/**
 * /uniti/adaptations — "What the class needs next".
 *
 * Renders the stored/seeded adaptation cards from the school DO. In Phase 3
 * these come from seed/rules (AI generation is Phase 5). The teacher records
 * an outcome (worked / partly / didn't), which POSTs an
 * `adaptation.outcome_recorded` event that the store projects onto the card.
 * RBAC: `adaptation:read`.
 */
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { roleCan, type Role } from '@shippie/cloudlet-contract';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login');
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

  const canRead = user.isAdmin || roles.some((r) => roleCan([r], 'read', { type: 'adaptation' }));
  if (!canRead) throw error(403, 'forbidden');
  const canRecord =
    user.isAdmin || roles.some((r) => roleCan([r], 'outcome_recorded', { type: 'adaptation' }));
  const canGenerate =
    user.isAdmin || roles.some((r) => roleCan([r], 'generate', { type: 'adaptation' }));

  const inst = await db
    .select({ slug: schema.privateAppInstances.slug, name: schema.privateAppInstances.name })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.id, instanceId))
    .limit(1);

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${instanceId}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
  const [cards, lessons, aiSetting] = await Promise.all([
    stub.listAdaptationCards(),
    stub.listLessons(),
    stub.getAiSetting(),
  ]);

  return {
    slug: inst[0]?.slug ?? '',
    schoolName: inst[0]?.name ?? '',
    userId: user.id,
    teacher: { name: user.displayName || user.email?.split('@')[0] || 'Teacher' },
    cards,
    lessons,
    canRecord,
    canGenerate,
    // AI ON/OFF from setup — drives whether "Generate" calls the broker path
    // or shows the offline-safe rules-only affordance.
    aiEnabled: aiSetting.aiEnabled,
  };
};
