// apps/web/lib/shippie/ratings.ts
/**
 * Marketplace ratings helpers. Pure functions over a Drizzle handle.
 *
 * One row per (app_id, user_id); rating is an integer in [1, 5]; review
 * text is optional. The summary helper computes the average + 1–5
 * distribution; the latest-reviews helper surfaces the newest rows with
 * non-empty review text for an app detail page; `upsertRating` inserts
 * or updates the caller's rating with `ON CONFLICT DO UPDATE`.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

export interface RatingSummary {
  /** Mean of all ratings for the app. 0 when no ratings exist. */
  average: number;
  /** Total number of ratings (one per user). */
  count: number;
  /** Count of ratings at each star level. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface LatestReview {
  userId: string;
  rating: number;
  review: string | null;
  createdAt: Date;
}

export async function queryRatingSummary(
  db: ShippieDb,
  appId: string,
): Promise<RatingSummary> {
  const rows = await db
    .select({ rating: schema.appRatings.rating })
    .from(schema.appRatings)
    .where(eq(schema.appRatings.appId, appId));
  const distribution: RatingSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sumN = 0;
  for (const r of rows) {
    const v = Number(r.rating) as 1 | 2 | 3 | 4 | 5;
    if (v >= 1 && v <= 5) {
      distribution[v] = (distribution[v] ?? 0) + 1;
      sumN += v;
    }
  }
  const count = rows.length;
  return { average: count === 0 ? 0 : sumN / count, count, distribution };
}

export async function queryLatestReviews(
  db: ShippieDb,
  appId: string,
  limit = 5,
): Promise<LatestReview[]> {
  const rows = await db
    .select({
      userId: schema.appRatings.userId,
      rating: schema.appRatings.rating,
      review: schema.appRatings.review,
      createdAt: schema.appRatings.createdAt,
    })
    .from(schema.appRatings)
    .where(and(eq(schema.appRatings.appId, appId), isNotNull(schema.appRatings.review)))
    .orderBy(desc(schema.appRatings.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    userId: r.userId,
    rating: Number(r.rating),
    review: r.review,
    createdAt: r.createdAt as Date,
  }));
}

export async function queryUserRating(
  db: ShippieDb,
  appId: string,
  userId: string,
): Promise<{ rating: number; review: string | null } | null> {
  const row = await db
    .select({ rating: schema.appRatings.rating, review: schema.appRatings.review })
    .from(schema.appRatings)
    .where(and(eq(schema.appRatings.appId, appId), eq(schema.appRatings.userId, userId)))
    .limit(1);
  const r = row[0];
  return r ? { rating: Number(r.rating), review: r.review } : null;
}

export async function upsertRating(
  db: ShippieDb,
  input: { appId: string; userId: string; rating: number; review?: string | null },
): Promise<void> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('invalid_rating');
  }
  const now = new Date();
  await db
    .insert(schema.appRatings)
    .values({
      appId: input.appId,
      userId: input.userId,
      rating: input.rating,
      review: input.review ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.appRatings.appId, schema.appRatings.userId],
      set: {
        rating: input.rating,
        review: input.review ?? null,
        updatedAt: now,
      },
    });
}
