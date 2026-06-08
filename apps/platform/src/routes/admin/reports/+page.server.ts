/**
 * /admin/reports — user abuse-report review queue.
 *
 * Lists app_reports joined to the app + reporter, filterable by status.
 * Two actions:
 *   - ?/setStatus — open | reviewing | actioned | dismissed (+ audit)
 *   - ?/suspend   — take the reported app offline via the Phase-1 kill
 *                   switch (writeSuspension KV flag → access gate 451),
 *                   mark the report 'actioned'.
 */
import { fail } from '@sveltejs/kit';
import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { notifyMakerOfTakedown } from '$server/admin/notify-maker';
import { writeSuspension } from '$server/deploy/kv-write';
import { bustSuspensionCache } from '$server/wrapper/platform-client';

export type AdminReportRow = {
  id: string;
  appId: string;
  slug: string;
  appName: string | null;
  appArchived: boolean | null;
  reason: string;
  detail: string | null;
  status: string;
  moderationFlags: string[] | null;
  reporterUsername: string | null;
  createdAt: string;
};

type StatusFilter = 'all' | 'open' | 'reviewing' | 'actioned' | 'dismissed';
const STATUS_VALUES = new Set(['open', 'reviewing', 'actioned', 'dismissed']);

function parseStatus(raw: string | null): StatusFilter {
  const allowed: StatusFilter[] = ['all', 'open', 'reviewing', 'actioned', 'dismissed'];
  return (allowed.includes(raw as StatusFilter) ? raw : 'open') as StatusFilter;
}

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const { platform, url } = event;
  if (!platform?.env.DB) {
    return { reports: [] as AdminReportRow[], filters: { status: 'open' as StatusFilter, q: '' } };
  }
  const db = getDrizzleClient(platform.env.DB);

  const status = parseStatus(url.searchParams.get('status'));
  const q = (url.searchParams.get('q') ?? '').trim();

  const conditions: SQL[] = [];
  if (status !== 'all') conditions.push(eq(schema.appReports.status, status));
  if (q.length > 0) {
    const needle = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const orCond = or(like(schema.appReports.slug, needle), like(schema.appReports.detail, needle));
    if (orCond) conditions.push(orCond);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.appReports.id,
      appId: schema.appReports.appId,
      slug: schema.appReports.slug,
      appName: schema.apps.name,
      appArchived: schema.apps.isArchived,
      reason: schema.appReports.reason,
      detail: schema.appReports.detail,
      status: schema.appReports.status,
      moderationFlags: schema.appReports.moderationFlags,
      reporterUsername: schema.users.username,
      createdAt: schema.appReports.createdAt,
    })
    .from(schema.appReports)
    .leftJoin(schema.apps, eq(schema.apps.id, schema.appReports.appId))
    .leftJoin(schema.users, eq(schema.users.id, schema.appReports.reporterUserId))
    .where(where)
    .orderBy(desc(schema.appReports.createdAt))
    .limit(300);

  return {
    reports: rows as AdminReportRow[],
    filters: { status, q },
  };
};

export const actions: Actions = {
  setStatus: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const status = String(form.get('status') ?? '');
    if (!id) return fail(400, { error: 'missing report id' });
    if (!STATUS_VALUES.has(status)) return fail(400, { error: 'invalid status' });

    const [before] = await db
      .select({ id: schema.appReports.id, status: schema.appReports.status })
      .from(schema.appReports)
      .where(eq(schema.appReports.id, id))
      .limit(1);
    if (!before) return fail(404, { error: 'report not found' });
    if (before.status === status) return { ok: true, noop: true };

    const now = new Date().toISOString();
    await db
      .update(schema.appReports)
      .set({ status, reviewedBy: admin.id, reviewedAt: now })
      .where(eq(schema.appReports.id, id));

    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.report.set_status',
      targetTable: 'app_reports',
      targetId: id,
      before: { status: before.status },
      after: { status },
    });
    return { ok: true };
  },

  suspend: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);
    const cache = event.platform.env.CACHE;

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'missing report id' });

    const [report] = await db
      .select({ id: schema.appReports.id, appId: schema.appReports.appId, slug: schema.appReports.slug })
      .from(schema.appReports)
      .where(eq(schema.appReports.id, id))
      .limit(1);
    if (!report) return fail(404, { error: 'report not found' });

    const [app] = await db
      .select({ id: schema.apps.id, slug: schema.apps.slug, makerId: schema.apps.makerId })
      .from(schema.apps)
      .where(eq(schema.apps.id, report.appId))
      .limit(1);
    if (!app) return fail(404, { error: 'app not found' });

    // SAFETY: enforcement reaches the live serving layer via the dedicated
    // suspended KV key (access gate → 451). Fail loud if KV is unavailable.
    if (!cache) {
      return fail(503, { error: 'enforcement cache unavailable — app NOT taken offline; retry' });
    }
    const now = new Date().toISOString();
    const suspensionReason = 'policy_violation';
    try {
      await writeSuspension(cache, app.slug, suspensionReason);
      bustSuspensionCache(app.slug);
    } catch (err) {
      console.error('[admin.report.suspend] KV enforcement failed', {
        slug: app.slug,
        err: err instanceof Error ? err.message : String(err),
      });
      return fail(500, { error: 'enforcement write failed — app state uncertain; retry' });
    }

    await db
      .update(schema.apps)
      .set({
        isArchived: true,
        suspensionReason,
        suspendedAt: now,
        suspendedBy: admin.id,
        takedownReason: 'Suspended from an abuse report.',
        updatedAt: now,
      } as Record<string, unknown>)
      .where(eq(schema.apps.id, app.id));

    // Reserve the slug so the maker can't redeploy the same name to reset
    // the case (mirrors the /admin suspend path; released on unarchive).
    try {
      await event.platform.env.DB.prepare(
        'INSERT OR IGNORE INTO reserved_slugs (slug, reason) VALUES (?, ?)',
      )
        .bind(app.slug, `suspension:${suspensionReason}`)
        .run();
    } catch (err) {
      console.warn('[admin.report.suspend] reserved_slugs insert failed', {
        slug: app.slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    await db
      .update(schema.appReports)
      .set({ status: 'actioned', reviewedBy: admin.id, reviewedAt: now })
      .where(eq(schema.appReports.id, id));

    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.report.suspend',
      targetTable: 'apps',
      targetId: app.id,
      before: { isArchived: false },
      after: { isArchived: true, suspensionReason, fromReport: id },
    });

    await notifyMakerOfTakedown(event.platform.env, db, {
      appId: app.id,
      slug: app.slug,
      makerId: app.makerId,
      reason: 'Suspended from an abuse report.',
      suspensionReason,
    });

    return { ok: true };
  },
};
