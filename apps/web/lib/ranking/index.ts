/**
 * Simple ranking formula for marketplace storefront.
 *
 * Per-type weighted score combining: recency of last deploy, compat
 * score, install count, upvote count, and active users. Real ranking
 * lands in Week 12 with burst detection and velocity windows.
 *
 * Run on every deploy; also suitable for an hourly cron.
 *
 * Spec v6 §10.
 */
import { eq, sql } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

interface Weights {
  recency: number;
  compat: number;
  installs: number;
  upvotes: number;
  active: number;
}

const TYPE_WEIGHTS: Record<string, Weights> = {
  app: { recency: 0.35, compat: 0.25, installs: 0.2, upvotes: 0.1, active: 0.1 },
  web_app: { recency: 0.3, compat: 0.3, installs: 0.15, upvotes: 0.15, active: 0.1 },
  website: { recency: 0.5, compat: 0.2, installs: 0.1, upvotes: 0.15, active: 0.05 },
};

const HALF_LIFE_DAYS = 14;

export async function computeRankingForApp(db: ShippieDb, appId: string): Promise<number> {
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return 0;

  const weights = TYPE_WEIGHTS[app.type] ?? TYPE_WEIGHTS.app!;

  const daysSince = app.lastDeployedAt
    ? (Date.now() - new Date(app.lastDeployedAt).getTime()) / 86_400_000
    : 365;
  const recency = Math.exp(-daysSince / HALF_LIFE_DAYS); // 0..1

  const compat = app.compatibilityScore / 5; // 0..1
  const installs = log01(app.installCount, 1000);
  const upvotes = log01(app.upvoteCount, 100);
  const active = log01(app.activeUsers30d, 500);

  const score =
    weights.recency * recency +
    weights.compat * compat +
    weights.installs * installs +
    weights.upvotes * upvotes +
    weights.active * active;

  const column =
    app.type === 'app'
      ? 'rankingScoreApp'
      : app.type === 'web_app'
        ? 'rankingScoreWebApp'
        : 'rankingScoreWebsite';

  await db
    .update(schema.apps)
    .set({ [column]: score, updatedAt: new Date() })
    .where(sql`id = ${appId}`);

  return score;
}

/** log10-compressed 0..1 score: 0 for n=0, ~1 at n=saturate. */
function log01(n: number, saturate: number): number {
  if (n <= 0) return 0;
  return Math.min(1, Math.log10(1 + n) / Math.log10(1 + saturate));
}
