/**
 * /admin/disputes — App Kind dispute review.
 *
 * Lists apps where the maker has formally disputed the detected kind.
 * Source: apps.current_public_kind_status = 'disputed'. The maker's
 * reason lives in the KV-stored app_kind_profile, keyed by slug.
 *
 * Admin actions (form):
 *   - accept    → publicKindStatus = 'confirmed' (the dispute wins;
 *                 the public marketplace now shows the maker's claim)
 *   - reject    → publicKindStatus = 'confirmed' (keeps the detected
 *                 kind, formally rejecting the dispute)
 *   - dismiss   → publicKindStatus = 'estimated' (no decision; back
 *                 to the auto-detection state, maker can re-dispute)
 *
 * Every action writes an audit_log row via recordAudit.
 */
import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { readAppKindProfile, writeAppKindProfile } from '$server/deploy/kv-write';

const ACTIONS = new Set(['accept', 'reject', 'dismiss']);

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  if (!event.platform?.env.DB) return { items: [] };
  const db = getDrizzleClient(event.platform.env.DB);

  const rows = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      detectedKind: schema.apps.currentDetectedKind,
      status: schema.apps.currentPublicKindStatus,
      makerEmail: schema.users.email,
      updatedAt: schema.apps.updatedAt,
    })
    .from(schema.apps)
    .innerJoin(schema.users, eq(schema.users.id, schema.apps.makerId))
    .where(eq(schema.apps.currentPublicKindStatus, 'disputed'))
    .orderBy(desc(schema.apps.updatedAt))
    .limit(200);

  // Hydrate maker's dispute reason from KV per slug (best-effort).
  const items = await Promise.all(
    rows.map(async (row) => {
      let declaredKind: string | null = null;
      let disputeReason: string | null = null;
      if (event.platform!.env.CACHE) {
        const profile = await readAppKindProfile(event.platform!.env.CACHE, row.slug).catch(
          () => null,
        );
        if (profile) {
          declaredKind = (profile as { declaredKind?: string | null }).declaredKind ?? null;
          disputeReason = (profile as { disputeReason?: string | null }).disputeReason ?? null;
        }
      }
      return { ...row, declaredKind, disputeReason };
    }),
  );

  return { items };
};

export const actions: Actions = {
  decide: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const slug = String(form.get('slug') ?? '');
    const decision = String(form.get('decision') ?? '');
    if (!id || !slug || !ACTIONS.has(decision)) {
      return fail(400, { error: 'invalid decision' });
    }

    // Map decision → next status. Accept and reject both land at
    // `confirmed` because once an admin has taken a decision, the
    // public surface should commit to a stable label; reject leaves
    // the detected kind as the public answer.
    const nextStatus = decision === 'dismiss' ? 'estimated' : 'confirmed';

    const db = getDrizzleClient(event.platform.env.DB);
    const [before] = await db
      .select({
        id: schema.apps.id,
        currentPublicKindStatus: schema.apps.currentPublicKindStatus,
        currentDetectedKind: schema.apps.currentDetectedKind,
      })
      .from(schema.apps)
      .where(eq(schema.apps.id, id))
      .limit(1);

    if (!before) return fail(404, { error: 'app not found' });

    await db
      .update(schema.apps)
      .set({ currentPublicKindStatus: nextStatus, updatedAt: new Date().toISOString() })
      .where(eq(schema.apps.id, id));

    // Sync to KV profile (best-effort) — keeps the public page coherent
    // with admin's call once the maker hits their dashboard.
    if (event.platform.env.CACHE) {
      const profile = await readAppKindProfile(event.platform.env.CACHE, slug).catch(() => null);
      if (profile) {
        const next = {
          ...(profile as Record<string, unknown>),
          publicKindStatus: nextStatus,
        };
        // On accept, also clear the dispute reason since it's resolved.
        if (decision === 'accept' || decision === 'reject') {
          delete (next as Record<string, unknown>).disputeReason;
        }
        await writeAppKindProfile(event.platform.env.CACHE, slug, next as Parameters<
          typeof writeAppKindProfile
        >[2]);
      }
    }

    await recordAudit(db, {
      actorUserId: admin.id,
      action: `admin.kind_dispute.${decision}`,
      targetTable: 'apps',
      targetId: id,
      before: {
        status: before.currentPublicKindStatus,
        detectedKind: before.currentDetectedKind,
      },
      after: { status: nextStatus, decision },
    });

    return { ok: true, decision };
  },
};
