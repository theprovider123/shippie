/**
 * /api/cloudlet/instances/[slug]/retention
 *
 * Per-school data-retention settings (Phase 9). The school decides how long raw
 * feedback NOTE text is kept; aggregates (feedback state) are always retained.
 *
 *   GET  — read the current policy + current settings.
 *   PUT  — set `retentionNotesMonths` (0 = keep indefinitely). Written as a
 *          workspace setting (so it lives with the school's data) AND audited.
 *   POST {action:'apply'} — run `applyRetention(now)` now (the same function a
 *          cron calls); returns what was purged.
 *
 * Gated to the data-controllers via RBAC `settings:update`
 * (owner / school_admin / office_manager).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { recordAudit } from '$server/admin/audit';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';

async function resolve(event: Parameters<RequestHandler>[0], action: 'read' | 'update') {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) return { error: 'platform bindings unavailable', status: 500 } as const;
  const user = event.locals.user;
  if (!user) return { error: 'unauthenticated', status: 401 } as const;
  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action,
    resource: { type: 'settings' },
  });
  if (!resolved) return { error: 'forbidden', status: 403 } as const;
  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${resolved.row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
  return { db, user, row: resolved.row, stub } as const;
}

export const GET: RequestHandler = async (event) => {
  const r = await resolve(event, 'read');
  if ('error' in r) return json({ error: r.error }, { status: r.status });
  const settings = await r.stub.listSettings();
  const months = Number(settings.find((s) => s.key === 'retention_notes_months')?.value ?? 0) || 0;
  return json({ retentionNotesMonths: months, settings });
};

export const PUT: RequestHandler = async (event) => {
  const r = await resolve(event, 'update');
  if ('error' in r) return json({ error: r.error }, { status: r.status });
  let body: { retentionNotesMonths?: number };
  try {
    body = (await event.request.json()) as { retentionNotesMonths?: number };
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const months = Math.max(0, Math.floor(Number(body.retentionNotesMonths ?? 0)));
  if (!Number.isFinite(months)) return json({ error: 'invalid_months' }, { status: 400 });
  await r.stub.setSetting('retention_notes_months', String(months));
  await recordAudit(r.db, {
    actorUserId: r.user.id,
    action: 'retention.policy_set',
    targetTable: `instance:${r.row.id}`,
    targetId: r.row.id,
    after: { retentionNotesMonths: months },
  });
  return json({ retentionNotesMonths: months });
};

export const POST: RequestHandler = async (event) => {
  const r = await resolve(event, 'update');
  if ('error' in r) return json({ error: r.error }, { status: r.status });
  const result = await r.stub.applyRetention();
  await recordAudit(r.db, {
    actorUserId: r.user.id,
    action: 'retention.applied',
    targetTable: `instance:${r.row.id}`,
    targetId: r.row.id,
    after: { ...result, via: 'manual' },
  });
  return json(result);
};
