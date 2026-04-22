/**
 * POST /api/auth/cli/device
 *
 * Start the Device Authorization Grant. Unauthenticated — returns a
 * device_code for the CLI to poll and a user_code for the human to
 * type in the browser at /auth/cli/activate.
 *
 * Request body (JSON): { client_name?: string, scopes?: string[] }
 *
 * RFC 8628 step 1. See apps/web/lib/cli-auth.ts for state machine.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createDeviceCode } from '@/lib/cli-auth';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

const DeviceRequestSchema = z.object({
  client_name: z.string().max(64).optional(),
  scopes: z.array(z.string().max(64)).optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('auth.cli.device', async (req: NextRequest) => {
  // Cheap abuse brake: 30 device codes / 10 min / IP. Real limits come from
  // the fact that each code expires in 15 min and is only useful after a
  // signed-in human approves it.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';
  const rl = checkRateLimit({
    key: `cli-device:${ip}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      { status: 429 },
    );
  }

  const parsed = await parseBody(req, DeviceRequestSchema);
  if (!parsed.ok) return parsed.response;
  const clientName = parsed.data.client_name ?? 'shippie-cli';
  const scopes = parsed.data.scopes ?? [];

  const result = await createDeviceCode({ clientName, scopes });

  return NextResponse.json({
    device_code: result.deviceCode,
    user_code: result.userCode,
    verification_uri: result.verificationUri,
    verification_uri_complete: result.verificationUriComplete,
    expires_in: result.expiresIn,
    interval: result.interval,
  });
});
