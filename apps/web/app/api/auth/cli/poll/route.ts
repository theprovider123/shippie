/**
 * POST /api/auth/cli/poll
 *
 * Exchange an approved device_code for a bearer token. Unauthenticated.
 * The CLI polls this endpoint every `interval` seconds until the response
 * flips from { status: "pending" } to { access_token, token_type, user_id }.
 *
 * RFC 8628 step 4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exchangeDeviceCode } from '@/lib/cli-auth';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

const PollSchema = z.object({
  device_code: z.string().trim().min(1).max(256),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('auth.cli.poll', async (req: NextRequest) => {
  // Per-IP rate limit. 1 poll/sec is the CLI default; we give ~120/min
  // of slack to cover dev tool retries without enabling polling storms.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';
  const rl = checkRateLimit({
    key: `cli-poll:${ip}`,
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'slow_down', retry_after_ms: rl.retryAfterMs },
      { status: 429 },
    );
  }

  const parsed = await parseBody(req, PollSchema);
  if (!parsed.ok) return parsed.response;

  const result = await exchangeDeviceCode(parsed.data.device_code);

  switch (result.status) {
    case 'pending':
      return NextResponse.json({ status: 'pending' });
    case 'approved':
      return NextResponse.json({
        status: 'approved',
        access_token: result.accessToken,
        token_type: 'Bearer',
        user_id: result.userId,
      });
    case 'expired':
      return NextResponse.json({ status: 'expired' }, { status: 410 });
    case 'already_consumed':
      return NextResponse.json({ status: 'already_consumed' }, { status: 409 });
    case 'not_found':
      return NextResponse.json({ status: 'not_found' }, { status: 404 });
  }
});
