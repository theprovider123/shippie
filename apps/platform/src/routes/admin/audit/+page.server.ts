/**
 * /admin/audit — read-only audit log viewer.
 *
 * Pulls the last `PAGE_SIZE` audit_log rows (joined to users for the
 * actor name), with three optional filters: action prefix, actor id,
 * and a date window. Pagination via `?p=N` (page index, 0-based).
 *
 * No mutations live on this surface.
 */
import { and, desc, eq, gte, like, type SQL } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';

const PAGE_SIZE = 200;

export type AuditDisplayRow = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorEmail: string | null;
  targetTable: string | null;
  targetId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

type Window = 'all' | '24h' | '7d' | '30d';

function parseWindow(raw: string | null): Window {
  return raw === '24h' || raw === '7d' || raw === '30d' ? raw : 'all';
}

/**
 * SQLite stores `created_at` as ISO strings. ISO strings sort
 * lexicographically by time when timezone-stable, so a >= comparison
 * against a synthesized cutoff works without a date function.
 */
function windowCutoff(w: Window): string | null {
  if (w === 'all') return null;
  const now = Date.now();
  const ms = w === '24h' ? 24 * 60 * 60 * 1000 : w === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString().replace('T', ' ').slice(0, 19);
}

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const { platform, url } = event;

  const action = (url.searchParams.get('action') ?? '').trim();
  const actor = (url.searchParams.get('actor') ?? '').trim();
  const window = parseWindow(url.searchParams.get('window'));
  const page = Math.max(0, Number.parseInt(url.searchParams.get('p') ?? '0', 10) || 0);

  if (!platform?.env.DB) {
    return {
      rows: [] as AuditDisplayRow[],
      page,
      hasMore: false,
      filters: { action, actor, window },
      actors: [] as Array<{ id: string; label: string }>,
      actions: [] as string[],
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  const conditions: SQL[] = [];
  if (action) {
    conditions.push(like(schema.auditLog.action, `${action.replace(/[%_]/g, (c) => `\\${c}`)}%`));
  }
  if (actor) {
    conditions.push(eq(schema.auditLog.actorUserId, actor));
  }
  const cutoff = windowCutoff(window);
  if (cutoff) {
    conditions.push(gte(schema.auditLog.createdAt, cutoff));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch one extra row to detect hasMore without a count(*).
  const offset = page * PAGE_SIZE;
  const raw = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      actorUserId: schema.auditLog.actorUserId,
      actorUsername: schema.users.username,
      actorEmail: schema.users.email,
      targetTable: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      metadata: schema.auditLog.metadata,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
    .where(where)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = raw.length > PAGE_SIZE;
  const sliced = hasMore ? raw.slice(0, PAGE_SIZE) : raw;

  const rows: AuditDisplayRow[] = sliced.map((r) => {
    const meta = (r.metadata ?? null) as Record<string, unknown> | null;
    const before = (meta && typeof meta.before === 'object' ? meta.before : null) as
      | Record<string, unknown>
      | null;
    const after = (meta && typeof meta.after === 'object' ? meta.after : null) as
      | Record<string, unknown>
      | null;
    return {
      id: r.id,
      action: r.action,
      actorUserId: r.actorUserId,
      actorUsername: r.actorUsername,
      actorEmail: r.actorEmail,
      targetTable: r.targetTable,
      targetId: r.targetId,
      before,
      after,
      createdAt: r.createdAt,
    };
  });

  // Filter dropdowns — distinct actions and actors observed in the
  // current window. Bounded by the same window/action/actor predicates
  // would create a circular UX, so just compute over the table.
  const actionsList = await db
    .selectDistinct({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .limit(200);

  const actorsList = await db
    .selectDistinct({
      id: schema.auditLog.actorUserId,
      username: schema.users.username,
      email: schema.users.email,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
    .limit(200);

  return {
    rows,
    page,
    hasMore,
    filters: { action, actor, window },
    actions: actionsList.map((r) => r.action).filter(Boolean).sort(),
    actors: actorsList
      .filter((a): a is { id: string; username: string | null; email: string | null } => !!a.id)
      .map((a) => ({ id: a.id, label: a.username ?? a.email ?? a.id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
};
