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
import { auth } from '@/lib/auth';
import { approveDeviceCode } from '@/lib/cli-auth';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('auth.cli.approve', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { user_code?: string };
  const userCode = (body.user_code ?? '').trim();
  if (!userCode) {
    return NextResponse.json({ error: 'missing_user_code' }, { status: 400 });
  }

  const result = await approveDeviceCode({ userCode, userId: session.user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true, client_name: result.clientName });
});
