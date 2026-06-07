/**
 * POST /api/cloudlet/instances/[slug]/erase
 *
 * Erasure (Phase 9 — the school's right to be forgotten). Two shapes:
 *
 *   { scope:'pupil', pupilId, reason? } — right-to-erasure for ONE pupil:
 *     purge that pupil's PII (roster row, class edges, feedback note text) but
 *     keep an anonymised tombstone + the feedback STATE so aggregate counts stay
 *     honest. Non-destructive to the rest of the school.
 *
 *   { scope:'school', confirm } — purge the ENTIRE school workspace via
 *     `deprovision('erase')`: wipe the DO SQLite + storage, remove the install,
 *     tombstone the control-plane row. Requires a TYPED confirmation equal to
 *     the school slug to guard against accident.
 *
 * Gated to owner / school_admin only (RBAC `instance:update` is held by
 * office_manager too, so we additionally require the caller to NOT be merely an
 * office_manager for the school-wide erase — school erase is owner-class).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { recordAudit } from '$server/admin/audit';
import { deprovision } from '$server/cloudlet/provisioning';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);

  let body: { scope?: string; pupilId?: string; reason?: string; confirm?: string };
  try {
    body = (await event.request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  // Per-pupil erasure — settings:update controllers (office_manager+).
  if (body.scope === 'pupil') {
    const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
      action: 'update',
      resource: { type: 'settings' },
    });
    if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
    if (!body.pupilId) return json({ error: 'missing_fields', required: ['pupilId'] }, { status: 400 });
    const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${resolved.row.id}`);
    const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
    const result = await stub.erasePupil(body.pupilId, body.reason ?? null);
    await recordAudit(db, {
      actorUserId: user.id,
      action: 'pupil.erased',
      targetTable: `instance:${resolved.row.id}`,
      targetId: body.pupilId,
      after: { ...result, reason: body.reason ?? null },
    });
    return json({ ok: true, ...result });
  }

  // School-wide erasure — owner-class only (a higher bar than settings:update).
  if (body.scope === 'school') {
    const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
      action: 'delete', // only owner / school_admin (wildcard) grant this
      resource: { type: 'instance' },
    });
    if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
    const { row } = resolved;
    // Typed confirmation guard — must equal the slug.
    if (body.confirm !== row.slug) {
      return json({ error: 'confirmation_required', expected: row.slug }, { status: 400 });
    }
    const manifest = await deprovision(
      {
        db,
        schoolWorkspaceNs: env.SCHOOL_WORKSPACE,
        recordAudit,
        actorUserId: user.id,
        now: Date.now(),
      },
      row.id,
      'erase',
    );
    return json({ ok: true, erased: true, manifest });
  }

  return json({ error: 'invalid_scope', allowed: ['pupil', 'school'] }, { status: 400 });
};
