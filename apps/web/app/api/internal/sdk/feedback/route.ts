/**
 * POST /api/internal/sdk/feedback
 *
 * Worker-only. Creates a feedback_items row. Supports both identified
 * (via bearer_token from BYO auth) and anonymous submissions.
 *
 * Request: { slug, bearer_token?, type, title?, body?, rating? }
 *
 * Spec v5 §2 (BYO backend identity bridge).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { parseRawBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FeedbackBodySchema = z.object({
  slug: z.string().min(1),
  bearer_token: z.string().nullish(),
  type: z.enum(['comment', 'bug', 'request', 'rating', 'praise']),
  title: z.string().max(200).optional(),
  body: z.string().max(10_000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export const POST = withLogger('sdk.feedback', async (req: NextRequest) => {
  const rawBody = await req.text();
  try {
    await verifyInternalRequest(req, rawBody);
  } catch (err) {
    return NextResponse.json(
      { error: 'unauthorized', message: (err as Error).message },
      { status: 401 },
    );
  }

  const parsed = parseRawBody(rawBody, FeedbackBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const rl = checkRateLimit({
    key: `feedback:${body.slug}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const db = await getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, body.slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });

  // Resolve identity via JWKS-validated JWT from the app's BYO backend.
  // Forged tokens are rejected — only cryptographically verified claims
  // are used for identity.
  let externalUserId: string | null = null;
  let externalUserDisplay: string | null = null;

  if (body.bearer_token) {
    const { verifyJwt } = await import('@/lib/identity/verify-jwt');
    const identity = await verifyJwt(
      body.bearer_token,
      app.backendType ?? null,
      app.backendUrl ?? null,
    );
    if (identity) {
      externalUserId = identity.sub;
      externalUserDisplay = identity.email ?? identity.name;
    }
    // If verification fails → treat as anonymous (no externalUserId)
  }

  const [row] = await db
    .insert(schema.feedbackItems)
    .values({
      appId: app.id,
      userId: null, // No platform user for BYO auth
      externalUserId,
      externalUserDisplay,
      type: body.type,
      title: body.title ?? null,
      body: body.body ?? null,
      rating: body.rating ?? null,
    })
    .returning();

  return NextResponse.json({ success: true, id: row!.id });
});
