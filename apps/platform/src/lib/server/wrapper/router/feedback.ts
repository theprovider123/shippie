/**
 * /__shippie/feedback — feedback ingestion.
 *
 * Posts a row to `feedback_items` with optional rating, type, title, body.
 * Rate-limited per (slug, identity): 10/min for authenticated, 3/min for
 * anonymous. Vote endpoint upserts into `feedback_votes`.
 *
 * Note: bearer-token validation against the user table is not done here —
 * that lives on the platform side. We accept the token shape as the rate
 * key and persist a hint into `external_user_id`/`external_user_display`
 * via `metadata`. Phase B trust on this lands when the maker-side auth
 * gateway is wired up.
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { and, eq, sql } from 'drizzle-orm';

function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

const ALLOWED_TYPES = new Set(['bug', 'idea', 'praise', 'rating', 'other']);
const MAX_BODY_LEN = 4000;

export async function handleFeedback(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const token = extractBearer(ctx.request);
  const ip = clientKey(ctx.request);

  const rlKey = token
    ? `feedback:${ctx.slug}:jwt:${token.slice(-16)}`
    : `feedback:${ctx.slug}:anon:${ip}`;
  const rl = checkRateLimit({
    key: rlKey,
    limit: token ? 10 : 3,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const body = (await ctx.request.json().catch(() => ({}))) as {
    type?: string;
    title?: string;
    body?: string;
    rating?: number;
    external_user_id?: string;
    external_user_display?: string;
  };
  if (!body.type || typeof body.type !== 'string' || !ALLOWED_TYPES.has(body.type)) {
    return Response.json({ error: 'invalid_type' }, { status: 400 });
  }
  if (body.rating != null && (typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5)) {
    return Response.json({ error: 'invalid_rating' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.slice(0, 280) : null;
  const text = typeof body.body === 'string' ? body.body.slice(0, MAX_BODY_LEN) : null;

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return Response.json({ error: 'unknown_app' }, { status: 404 });

  let id: string;
  try {
    const [row] = await db
      .insert(schema.feedbackItems)
      .values({
        appId: app.id,
        userId: null,
        type: body.type,
        title,
        body: text,
        rating: body.rating ?? null,
        externalUserId: body.external_user_id ?? null,
        externalUserDisplay: body.external_user_display ?? null,
        metadata: { source: 'wrapper', has_bearer: !!token },
      })
      .returning({ id: schema.feedbackItems.id });
    if (!row) throw new Error('no row returned');
    id = row.id;
  } catch (err) {
    console.error('[wrapper:feedback] insert failed', { slug: ctx.slug, err });
    return Response.json({ error: 'insert_failed' }, { status: 500 });
  }

  return Response.json({ ok: true, id });
}

export async function handleFeedbackVote(
  ctx: WrapperContext,
  feedbackId: string,
): Promise<Response> {
  const token = extractBearer(ctx.request);
  if (!token) {
    return Response.json(
      {
        error: 'unauthenticated',
        message: 'Voting requires a signed-in user. Pass Authorization: Bearer <jwt>.',
      },
      { status: 401 },
    );
  }
  const body = (await ctx.request.json().catch(() => ({}))) as { value?: number };
  if (body.value !== 1 && body.value !== -1) {
    return Response.json({ error: 'value must be 1 or -1' }, { status: 400 });
  }

  const rl = checkRateLimit({
    key: `feedback-vote:${ctx.slug}:${token.slice(-16)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const db = getDrizzleClient(ctx.env.DB);
  const externalUserId = `wrapper:${token.slice(-16)}`;

  try {
    // Insert a vote row. Track external_user_id so duplicates can be reconciled
    // when the platform-side identity link lands.
    await db.insert(schema.feedbackVotes).values({
      feedbackId,
      userId: null,
      externalUserId,
      value: body.value,
    });

    // Best-effort vote_count increment.
    await db
      .update(schema.feedbackItems)
      .set({
        voteCount: sql`${schema.feedbackItems.voteCount} + ${body.value}`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(schema.feedbackItems.id, feedbackId)));
  } catch (err) {
    console.error('[wrapper:feedback-vote] insert failed', { feedbackId, err });
    return Response.json({ error: 'insert_failed' }, { status: 500 });
  }

  return Response.json({ ok: true, feedback_id: feedbackId });
}
