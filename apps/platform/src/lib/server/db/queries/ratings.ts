/**
 * Ratings queries — Drizzle over D1.
 *
 * Port of `apps/web/lib/shippie/ratings.ts` from the Postgres-based
 * platform. Same shapes (`RatingSummary`, `LatestReview`) so the
 * `RatingsSummary.svelte` component renders the same payload.
 *
 * Note: app_ratings.app_id stores the apps.id (uuid), NOT the slug, on
 * the platform side. The Postgres legacy stored slug; the D1 mirror
 * normalised it to id during the import. Pass `app.id` to these helpers.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { ShippieDb } from '../client';
import { appRatings } from '../schema';

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface LatestReview {
  userId: string;
  rating: number;
  review: string | null;
  createdAt: string;
}

export async function summaryForApp(db: ShippieDb, appId: string): Promise<RatingSummary> {
  const rows = await db
    .select({ rating: appRatings.rating })
    .from(appRatings)
    .where(eq(appRatings.appId, appId));

  const distribution: RatingSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of rows) {
    const v = Number(r.rating) as 1 | 2 | 3 | 4 | 5;
    if (v >= 1 && v <= 5) {
      distribution[v] = (distribution[v] ?? 0) + 1;
      sum += v;
    }
  }
  const count = rows.length;
  return { average: count === 0 ? 0 : sum / count, count, distribution };
}

export async function recentReviews(
  db: ShippieDb,
  appId: string,
  limit = 5,
): Promise<LatestReview[]> {
  const rows = await db
    .select({
      userId: appRatings.userId,
      rating: appRatings.rating,
      review: appRatings.review,
      createdAt: appRatings.createdAt,
    })
    .from(appRatings)
    .where(and(eq(appRatings.appId, appId), isNotNull(appRatings.review)))
    .orderBy(desc(appRatings.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    userId: r.userId,
    rating: Number(r.rating),
    review: r.review,
    createdAt: r.createdAt,
  }));
}
