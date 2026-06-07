/**
 * GET /api/cloudlet/instances/[slug]/export
 *
 * Full per-school data export — the school OWNS its data (Phase 9). Streams the
 * complete workspace as JSON: roster, lessons, feedback (incl. safeguarding note
 * text — this is the school's own copy), adaptation cards, settings, tombstones,
 * the append-only event log, the workspace audit, AND the Phase-8 leadership
 * evidence summary.
 *
 * Gated to owner / school_admin via RBAC `instance:update` (held by owner /
 * school_admin / office_manager). Erasure-class data → narrow it further to the
 * `settings:*` capability so a teacher/leader cannot pull the full school dump.
 * DO stub derived from the IMMUTABLE instance id.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { recordAudit } from '$server/admin/audit';
import { buildLeadershipRollup } from '$server/cloudlet/leadership-rollup';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  // settings:read is held by owner / school_admin / office_manager — the
  // data-controllers. Teachers/leaders are denied the full export.
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'read',
    resource: { type: 'settings' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
  const { row } = resolved;

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const data = await stub.buildExport();

  // Append the Phase-8 leadership evidence summary so the export is a single
  // self-contained artifact a DPO / new provider can take.
  const evidenceSummary = buildLeadershipRollup({
    instanceId: row.id,
    events: data.events,
    subjects: data.subjects,
    lessons: data.lessons,
    roster: data.roster.pupils,
    activeOnly: false, // historic included — the school's full record
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: 'private_app_instance.exported',
    targetTable: `instance:${row.id}`,
    targetId: row.id,
    after: { mode: 'export', via: 'api', events: data.events.length },
  });

  const payload = {
    school: { id: row.id, slug: row.slug, name: row.name, region: row.region },
    exportedAt: new Date().toISOString(),
    boundary: "This export is the complete contents of this school's private workspace.",
    workspace: data,
    evidenceSummary,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="uniti-${row.slug}-export.json"`,
    },
  });
};
