/**
 * POST /api/internal/sdk/feedback/vote
 *
 * Worker-only. Records an upvote/downvote using the BYO identity bridge.
 * Deduplicates via external_user_id (partial unique index from migration 0009).
 *
 * Request: { slug, bearer_token, feedback_id, value: -1 | 1 }
 *
 * Spec v5 §2 (identity bridge).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { parseRawBody } from '@/lib/internal/validation';
import { verifyJwt } from '@/lib/identity/verify-jwt';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FeedbackVoteSchema = z.object({
  slug: z.string().min(1),
  bearer_token: z.string().optional(),
  feedback_id: z.string().min(1),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const POST = withLogger('sdk.feedback.vote', async (req: NextRequest) => {
  const rawBody = await req.text();
  try {
    await verifyInternalRequest(req, rawBody);
  } catch (err) {
    return NextResponse.json(
      { error: 'unauthorized', message: (err as Error).message },
      { status: 401 },
    );
  }

  const parsed = parseRawBody(rawBody, FeedbackVoteSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const rl = checkRateLimit({
    key: `feedback-vote:${body.slug}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  if (!body.bearer_token) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Voting requires a signed-in user.' }, { status: 401 });
  }

  const db = await getDb();

  // Resolve app + verify JWT
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, body.slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });

  const identity = await verifyJwt(
    body.bearer_token,
    app.backendType ?? null,
    app.backendUrl ?? null,
  );
  if (!identity) {
    return NextResponse.json({ error: 'invalid_token', message: 'JWT verification failed.' }, { status: 401 });
  }

  // Verify the feedback item belongs to this app
  const item = await db.query.feedbackItems.findFirst({
    where: and(
      eq(schema.feedbackItems.id, body.feedback_id),
      eq(schema.feedbackItems.appId, app.id),
    ),
  });
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return db.transaction(async (tx) => {
    // Dedup via external_user_id (uses partial unique index feedback_votes_external_uniq)
    const existing = await tx.query.feedbackVotes.findFirst({
      where: and(
        eq(schema.feedbackVotes.feedbackId, body.feedback_id),
        eq(schema.feedbackVotes.externalUserId, identity.sub),
      ),
    });

    let delta = 0;
    if (!existing) {
      await tx.insert(schema.feedbackVotes).values({
        feedbackId: body.feedback_id,
        externalUserId: identity.sub,
        value: body.value,
      });
      delta = body.value;
    } else if (existing.value !== body.value) {
      await tx
        .update(schema.feedbackVotes)
        .set({ value: body.value })
        .where(eq(schema.feedbackVotes.id, existing.id));
      delta = body.value * 2;
    }

    if (delta !== 0) {
      await tx
        .update(schema.feedbackItems)
        .set({ voteCount: sql`${schema.feedbackItems.voteCount} + ${delta}` })
        .where(eq(schema.feedbackItems.id, body.feedback_id));
    }

    return NextResponse.json({ success: true, delta });
  });
});
