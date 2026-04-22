// apps/web/lib/shippie/co-installs.ts
/**
 * Co-install recommender query.
 *
 * Reads from `user_touch_graph`, which the hourly rollup cron
 * maintains as per-pair `(app_a, app_b)` counters of distinct users
 * who touched both apps. Given a subject `appId`, returns the other
 * apps it shares the most users with, ranked by that user count.
 */
import { desc, eq, or } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

export interface CoInstall {
  appId: string;
  score: number;
}

/**
 * Return apps that share users with `appId`, ranked by the pair's
 * user count (highest first). `limit` defaults to 6 — enough to fill
 * a small "people who use this also use…" strip.
 */
export async function queryCoInstalls(
  db: ShippieDb,
  appId: string,
  limit = 6,
): Promise<CoInstall[]> {
  const rows = await db
    .select({
      appA: schema.userTouchGraph.appA,
      appB: schema.userTouchGraph.appB,
      users: schema.userTouchGraph.users,
    })
    .from(schema.userTouchGraph)
    .where(
      or(eq(schema.userTouchGraph.appA, appId), eq(schema.userTouchGraph.appB, appId)),
    )
    .orderBy(desc(schema.userTouchGraph.users))
    .limit(limit);

  return rows.map((r) => ({
    appId: r.appA === appId ? r.appB : r.appA,
    score: Number(r.users),
  }));
}
