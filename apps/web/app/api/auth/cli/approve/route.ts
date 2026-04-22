/**
 * POST /api/auth/cli/approve
 *
 * Called by the signed-in activation page (/auth/cli/activate) to bind
 * a user_code to the current user. Must be authenticated via the normal
 * Auth.js session cookie.
 *
 * RFC 8628 step 3.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { approveDeviceCode } from '@/lib/cli-auth';
import { parseBody } from '@/lib/internal/validation';
import { withLogger } from '@/lib/observability/logger';

const ApproveSchema = z.object({
  user_code: z.string().trim().min(1).max(64),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('auth.cli.approve', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = await parseBody(req, ApproveSchema);
  if (!parsed.ok) return parsed.response;

  const result = await approveDeviceCode({ userCode: parsed.data.user_code, userId: session.user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true, client_name: result.clientName });
});
