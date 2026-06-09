/**
 * /admin/updates — behavior-delta monitoring feed.
 *
 * Updates ship instantly (no gate); this surfaces versions that CHANGED
 * behavior (new connect domains, capabilities, external network, bundle
 * jumps, kind change) vs the previous active deploy — ranked by app
 * popularity so a human can glance at the riskiest ones. Read-only.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';

interface StoredDelta {
  delta?: { score?: number; additions?: string[]; high?: boolean };
}

export type AdminUpdateRow = {
  deployId: string;
  slug: string;
  appName: string | null;
  version: number;
  score: number;
  additions: string[];
  high: boolean;
  upvoteCount: number;
  activeUsers30d: number;
  isArchived: boolean | null;
  createdAt: string;
};

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const { platform, url } = event;
  const showAll = url.searchParams.get('all') === '1';
  if (!platform?.env.DB) {
    return { updates: [] as AdminUpdateRow[], showAll };
  }
  const db = getDrizzleClient(platform.env.DB);

  const rows = await db
    .select({
      deployId: schema.deploys.id,
      version: schema.deploys.version,
      behaviorDeltaJson: schema.deploys.behaviorDeltaJson,
      createdAt: schema.deploys.createdAt,
      slug: schema.apps.slug,
      appName: schema.apps.name,
      upvoteCount: schema.apps.upvoteCount,
      activeUsers30d: schema.apps.activeUsers30d,
      isArchived: schema.apps.isArchived,
    })
    .from(schema.deploys)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.deploys.appId))
    .where(and(eq(schema.deploys.status, 'success'), isNotNull(schema.deploys.behaviorDeltaJson)))
    .orderBy(desc(schema.deploys.createdAt))
    .limit(400);

  const updates: AdminUpdateRow[] = [];
  for (const r of rows) {
    const stored = r.behaviorDeltaJson as StoredDelta | null;
    const delta = stored?.delta;
    if (!delta || !Array.isArray(delta.additions) || delta.additions.length === 0) continue;
    const high = delta.high === true;
    if (!showAll && !high) continue;
    updates.push({
      deployId: r.deployId,
      slug: r.slug,
      appName: r.appName,
      version: r.version,
      score: typeof delta.score === 'number' ? delta.score : 0,
      additions: delta.additions,
      high,
      upvoteCount: r.upvoteCount ?? 0,
      activeUsers30d: r.activeUsers30d ?? 0,
      isArchived: r.isArchived,
      createdAt: r.createdAt,
    });
  }

  // Rank by popularity-weighted risk so the updates worth a human glance
  // float to the top: score × (1 + popularity signal).
  updates.sort((a, b) => {
    const wa = a.score * (1 + a.upvoteCount + a.activeUsers30d);
    const wb = b.score * (1 + b.upvoteCount + b.activeUsers30d);
    return wb - wa;
  });

  return { updates, showAll };
};
