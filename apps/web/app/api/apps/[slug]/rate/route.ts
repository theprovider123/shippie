// apps/web/app/api/apps/[slug]/rate/route.ts
/**
 * POST /api/apps/[slug]/rate — upsert the signed-in user's rating for
 * an app.
 *
 * Body: `{ rating: 1|2|3|4|5, review?: string | null }`.
 *
 * Review text is trimmed and clamped to 2000 chars; empty/whitespace-only
 * strings are normalised to `null`. Rating must be an integer in [1,5] —
 * anything else returns 400 `invalid_rating`.
 */
import { type NextRequest } from 'next/server';
import { withLogger } from '@/lib/observability/logger';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { upsertRating } from '@/lib/shippie/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  rating?: unknown;
  review?: unknown;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = withLogger(
  'apps.rate',
  async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return json({ error: 'unauthorized' }, 401);
    }

    const { slug } = await ctx.params;

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const rating = typeof body.rating === 'number' ? body.rating : NaN;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: 'invalid_rating' }, 400);
    }

    const review =
      typeof body.review === 'string' && body.review.trim().length > 0
        ? body.review.trim().slice(0, 2000)
        : null;

    const db = await getDb();
    await upsertRating(db, { appId: slug, userId, rating, review });

    return json({ ok: true }, 200);
  },
);
