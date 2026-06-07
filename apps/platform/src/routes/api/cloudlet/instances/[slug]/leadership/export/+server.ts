/**
 * GET /api/cloudlet/instances/[slug]/leadership/export
 *
 * Exportable EVIDENCE SUMMARY for leaders / SENCOs (Phase 8). Produces a clean
 * rollup a leader could show in a meeting or attach to an inspection / EHCP
 * context. Two formats:
 *   - ?format=json (default) — the structured `LeadershipRollup`.
 *   - ?format=html          — a standalone, print-friendly document.
 * Scope:
 *   - ?scope=current (default) — active cohort only.
 *   - ?scope=historic          — include tombstoned leavers (historic evidence).
 *
 * RBAC-gated on `progress:read` (leader / school_admin / owner). DO stub derived
 * from the IMMUTABLE instance id. HONESTY GUARD: the output is labelled
 * "lesson feedback evidence" — never "attainment".
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { buildLeadershipRollup, renderRollupHtml } from '$server/cloudlet/leadership-rollup';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'read',
    resource: { type: 'progress' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
  const { row } = resolved;

  const format = event.url.searchParams.get('format') === 'html' ? 'html' : 'json';
  const activeOnly = event.url.searchParams.get('scope') !== 'historic';

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const [events, subjects, lessons, snapshot] = await Promise.all([
    stub.listEvents(),
    stub.listSubjects(),
    stub.listLessons(),
    stub.rosterSnapshot(),
  ]);

  const rollup = buildLeadershipRollup({
    instanceId: row.id,
    events,
    subjects,
    lessons,
    roster: snapshot.pupils,
    activeOnly,
  });

  if (format === 'json') {
    return json({ schoolName: row.name, rollup });
  }

  // Name resolution for the HTML view — the roster snapshot carries names for
  // active AND tombstoned pupils, so leavers resolve in historic exports too.
  const nameById = new Map(snapshot.pupils.map((p) => [p.id, p.name]));
  const html = renderRollupHtml(rollup, {
    schoolName: row.name,
    period: 'Summer Term 2026',
    generatedBy: user.displayName || user.email?.split('@')[0] || undefined,
    resolveName: (id) => nameById.get(id) ?? id,
  });
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `inline; filename="${row.slug}-feedback-evidence.html"`,
    },
  });
};
