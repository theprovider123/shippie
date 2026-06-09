/**
 * /admin — apps moderation list.
 *
 * Loads every app (no visibility/archive filter — admins see all), with
 * a maker join for the username column. Sort + filter happen server-
 * side via search params so deep-links (`?sort=upvotes&q=foo`) survive
 * reloads.
 *
 * Three form actions:
 *   - ?/archive       — set is_archived=true
 *   - ?/unarchive     — set is_archived=false
 *   - ?/setVisibility — public | unlisted | private
 *
 * Every action writes an audit_log row via `recordAudit`. The before/
 * after JSON captures the changed fields only — keeps the metadata
 * column small.
 */
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, like, or, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { notifyMakerOfTakedown } from '$server/admin/notify-maker';
import { writeSuspension, clearSuspension, patchAppMeta } from '$server/deploy/kv-write';
import { bustSuspensionCache } from '$server/wrapper/platform-client';

export type AdminAppRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  makerId: string;
  makerUsername: string | null;
  makerEmail: string;
  latestDeployStatus: string | null;
  visibilityScope: string;
  isArchived: boolean;
  themeColor: string;
  upvoteCount: number;
  createdAt: string;
};

type SortKey = 'created' | 'name' | 'upvotes' | 'status' | 'visibility';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'live' | 'building' | 'failed' | 'archived';

const SORT_COLUMN: Record<SortKey, SQLWrapper> = {
  created: schema.apps.createdAt,
  name: schema.apps.name,
  upvotes: schema.apps.upvoteCount,
  status: schema.apps.latestDeployStatus,
  visibility: schema.apps.visibilityScope,
};

function parseSort(raw: string | null): { key: SortKey; dir: SortDir } {
  const allowed: SortKey[] = ['created', 'name', 'upvotes', 'status', 'visibility'];
  const [k, d] = (raw ?? 'created:desc').split(':');
  const key = (allowed.includes(k as SortKey) ? k : 'created') as SortKey;
  const dir: SortDir = d === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

function parseStatus(raw: string | null): StatusFilter {
  const allowed: StatusFilter[] = ['all', 'live', 'building', 'failed', 'archived'];
  return (allowed.includes(raw as StatusFilter) ? raw : 'all') as StatusFilter;
}

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const { platform, url } = event;
  if (!platform?.env.DB) {
    return {
      apps: [] as AdminAppRow[],
      categories: [] as string[],
      filters: { q: '', category: 'all', status: 'all' as StatusFilter, sort: 'created:desc' },
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  const q = (url.searchParams.get('q') ?? '').trim();
  const category = (url.searchParams.get('category') ?? 'all').trim();
  const status = parseStatus(url.searchParams.get('status'));
  const { key: sortKey, dir: sortDir } = parseSort(url.searchParams.get('sort'));

  // Build the predicate.
  const conditions: SQL[] = [];
  if (q.length > 0) {
    const needle = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const orCond = or(
      like(schema.apps.name, needle),
      like(schema.apps.slug, needle),
    );
    if (orCond) conditions.push(orCond);
  }
  if (category && category !== 'all') {
    conditions.push(eq(schema.apps.category, category));
  }
  if (status === 'archived') {
    conditions.push(eq(schema.apps.isArchived, true));
  } else if (status === 'live') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'success'));
    conditions.push(eq(schema.apps.isArchived, false));
  } else if (status === 'building') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'building'));
  } else if (status === 'failed') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'failed'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const sortCol = SORT_COLUMN[sortKey];
  const orderClause = sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      category: schema.apps.category,
      makerId: schema.apps.makerId,
      makerUsername: schema.users.username,
      makerEmail: schema.users.email,
      latestDeployStatus: schema.apps.latestDeployStatus,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      themeColor: schema.apps.themeColor,
      upvoteCount: schema.apps.upvoteCount,
      createdAt: schema.apps.createdAt,
    })
    .from(schema.apps)
    .leftJoin(schema.users, eq(schema.users.id, schema.apps.makerId))
    .where(where)
    .orderBy(orderClause)
    .limit(500);

  // Distinct categories for the filter chip — across ALL apps, not the
  // currently-filtered subset, so admins can pivot freely.
  const categoryRows = await db
    .selectDistinct({ category: schema.apps.category })
    .from(schema.apps);

  const apps: AdminAppRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    makerId: r.makerId,
    makerUsername: r.makerUsername,
    makerEmail: r.makerEmail ?? '',
    latestDeployStatus: r.latestDeployStatus,
    visibilityScope: r.visibilityScope,
    isArchived: r.isArchived,
    themeColor: r.themeColor,
    upvoteCount: r.upvoteCount,
    createdAt: r.createdAt,
  }));

  return {
    apps,
    categories: categoryRows.map((c) => c.category).filter((c): c is string => !!c).sort(),
    filters: { q, category, status, sort: `${sortKey}:${sortDir}` },
  };
};

const VISIBILITY_VALUES = new Set(['public', 'unlisted', 'private']);

export const actions: Actions = {
  archive: async (event) => {
    return setArchived(event, true);
  },
  unarchive: async (event) => {
    return setArchived(event, false);
  },
  setVisibility: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const visibility = String(form.get('visibility') ?? '');
    if (!id) return fail(400, { error: 'missing app id' });
    if (!VISIBILITY_VALUES.has(visibility)) {
      return fail(400, { error: 'invalid visibility' });
    }

    const [before] = await db
      .select({
        id: schema.apps.id,
        slug: schema.apps.slug,
        visibilityScope: schema.apps.visibilityScope,
        surface: schema.apps.surface,
      })
      .from(schema.apps)
      .where(eq(schema.apps.id, id))
      .limit(1);

    if (!before) return fail(404, { error: 'app not found' });
    if (before.visibilityScope === visibility) {
      return { ok: true, noop: true };
    }

    // When publishing to public, lift a stuck 'archived' surface so the app
    // actually appears in marketplace listings.
    const newSurface = (visibility === 'public' && before.surface === 'archived') ? 'featured' : undefined;

    await db
      .update(schema.apps)
      .set({
        visibilityScope: visibility,
        ...(newSurface ? { surface: newSurface } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.apps.id, id));

    // Sync KV meta so the wrapper dispatch reads the new visibility immediately.
    const cache = event.platform?.env.CACHE;
    if (cache) {
      try {
        await patchAppMeta(cache, before.slug, {
          slug: before.slug,
          visibility_scope: visibility,
        });
      } catch (err) {
        console.error('[admin.setVisibility] KV sync failed — reconcile-kv will repair', err);
      }
    }

    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.app.set_visibility',
      targetTable: 'apps',
      targetId: id,
      before: { visibilityScope: before.visibilityScope, ...(newSurface ? { surface: before.surface } : {}) },
      after: { visibilityScope: visibility, ...(newSurface ? { surface: newSurface } : {}) },
    });

    return { ok: true };
  },
};

async function setArchived(
  event: Parameters<Actions[string]>[0],
  archived: boolean,
) {
  const admin = requireAdmin(event);
  if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
  const db = getDrizzleClient(event.platform.env.DB);

  const form = await event.request.formData();
  const id = String(form.get('id') ?? '');
  if (!id) return fail(400, { error: 'missing app id' });

  // Optional reason (free-text). When `suspensionReason` is one of the
  // enforcement categories, this is treated as an admin enforcement
  // action — the suspension columns get populated, the maker gets
  // notified, and the slug enters the hold list. Otherwise it's a
  // maker-style cleanup archive with just `takedownReason` recorded.
  const reason = (form.get('reason')?.toString() ?? '').trim() || null;
  const suspensionReasonRaw = (form.get('suspensionReason')?.toString() ?? '').trim();
  const SUSPENSION_VALUES = new Set(['dmca', 'policy_violation', 'spam']);
  const isSuspension = archived && SUSPENSION_VALUES.has(suspensionReasonRaw);
  const suspensionReason = isSuspension ? suspensionReasonRaw : null;

  const [before] = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      makerId: schema.apps.makerId,
      isArchived: schema.apps.isArchived,
      takedownReason: schema.apps.takedownReason,
      suspensionReason: schema.apps.suspensionReason,
      suspendedAt: schema.apps.suspendedAt,
      suspendedBy: schema.apps.suspendedBy,
    })
    .from(schema.apps)
    .where(eq(schema.apps.id, id))
    .limit(1);

  if (!before) return fail(404, { error: 'app not found' });

  // SAFETY: enforcement must reach the live serving layer via the dedicated
  // apps:{slug}:suspended KV key that the access gate reads. For a takedown —
  // or lifting one — ALWAYS write/clear the key, even when the D1 row already
  // matches (this repairs a missing/stale KV flag on a re-suspend), and FAIL
  // LOUD if KV is unavailable: a takedown must never look successful while the
  // app stays online.
  const isClearingSuspension = !archived && (before.suspensionReason ?? null) !== null;
  const cache = event.platform.env.CACHE;
  if (isSuspension || isClearingSuspension) {
    if (!cache) {
      return fail(503, { error: 'enforcement cache unavailable — app NOT taken offline; retry' });
    }
    try {
      if (isSuspension) await writeSuspension(cache, before.slug, suspensionReason);
      else await clearSuspension(cache, before.slug);
      bustSuspensionCache(before.slug); // local isolate; remote isolates clear on the 30s memo
    } catch (err) {
      console.error('[admin.suspend] KV enforcement failed', {
        slug: before.slug,
        err: err instanceof Error ? err.message : String(err),
      });
      return fail(500, { error: 'enforcement write failed — app state uncertain; retry' });
    }
  }

  // D1 no-op: row already in the target state. KV enforcement above has run,
  // so returning here is safe (no D1 / audit churn).
  if (
    before.isArchived === archived &&
    (before.takedownReason ?? null) === reason &&
    (before.suspensionReason ?? null) === suspensionReason
  ) {
    return { ok: true, noop: true };
  }

  const now = new Date().toISOString();
  await db
    .update(schema.apps)
    .set({
      isArchived: archived,
      takedownReason: archived ? reason : null,
      suspensionReason,
      suspendedAt: isSuspension ? now : archived ? before.suspendedAt ?? null : null,
      suspendedBy: isSuspension ? admin.id : archived ? before.suspendedBy ?? null : null,
      updatedAt: now,
    } as Record<string, unknown>)
    .where(eq(schema.apps.id, id));

  // Normalize undefined → null in audit metadata so the JSON column has a
  // stable shape regardless of whether older rows were created before the
  // suspension columns existed.
  await recordAudit(db, {
    actorUserId: admin.id,
    action: archived
      ? isSuspension
        ? 'admin.app.suspend'
        : 'admin.app.archive'
      : 'admin.app.unarchive',
    targetTable: 'apps',
    targetId: id,
    before: {
      isArchived: before.isArchived,
      takedownReason: before.takedownReason ?? null,
      suspensionReason: before.suspensionReason ?? null,
    },
    after: { isArchived: archived, takedownReason: archived ? reason : null, suspensionReason },
  });

  // Notify the maker on the transition. notifyMakerOfTakedown is a
  // no-op when the EMAIL binding is missing (dev), so this never blocks
  // the action — it's a best-effort side-channel.
  if (archived && !before.isArchived) {
    await notifyMakerOfTakedown(event.platform.env, db, {
      appId: id,
      slug: before.slug,
      makerId: before.makerId,
      reason,
      suspensionReason,
    });
  }

  // Suspension-grade takedowns (dmca / policy_violation / spam) also
  // place the slug on the reserved list so the maker can't redeploy the
  // same name with slightly different content and reset the case. Plain
  // archives (no suspension reason) DON'T touch reserved_slugs — those
  // are maker-style cleanup and unarchive should be uncontentious.
  // Idempotent: if the row already exists, INSERT OR IGNORE leaves it
  // alone. If the admin later unarchives without lifting suspension,
  // the reserved row stays — that's intentional.
  if (isSuspension) {
    try {
      await event.platform.env.DB.prepare(
        'INSERT OR IGNORE INTO reserved_slugs (slug, reason) VALUES (?, ?)',
      )
        .bind(before.slug, `suspension:${suspensionReason}`)
        .run();
    } catch (err) {
      console.warn('[admin.suspend] reserved_slugs insert failed', {
        slug: before.slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Full reinstatement (product decision 2026-06-08): lifting a suspension
  // releases the reserved-slug hold so the maker can fix and redeploy.
  if (isClearingSuspension) {
    try {
      await event.platform.env.DB.prepare('DELETE FROM reserved_slugs WHERE slug = ?')
        .bind(before.slug)
        .run();
    } catch (err) {
      console.warn('[admin.unarchive] reserved_slugs release failed', {
        slug: before.slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true };
}
