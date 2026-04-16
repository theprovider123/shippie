/**
 * GET /api/auth/dev-signin
 *
 * One-click sign-in for local development. Creates (or reuses) a user
 * from the first email in `ADMIN_EMAILS` and mints an Auth.js-compatible
 * database session without the magic-link round-trip.
 *
 * Guards:
 *   - Refuses to run when NODE_ENV === 'production'
 *   - Refuses if ADMIN_EMAILS is empty
 *
 * This route is meant to be deleted (or feature-flagged off) before the
 * platform is exposed publicly.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Match Auth.js v5 default session cookie names.
const COOKIE_INSECURE = 'authjs.session-token';
const COOKIE_SECURE = '__Secure-authjs.session-token';

export const GET = withLogger('auth.dev-signin', async (req: NextRequest) => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled_in_production' }, { status: 403 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminEmails.length === 0) {
    return NextResponse.json(
      { error: 'no_admin_email', reason: 'Set ADMIN_EMAILS in apps/web/.env.local' },
      { status: 400 },
    );
  }

  const email = adminEmails[0]!;
  const db = await getDb();

  // Find-or-create the user.
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user) {
    const [inserted] = await db
      .insert(schema.users)
      .values({
        email,
        name: 'Dev Admin',
        emailVerified: new Date(),
      })
      .returning();
    if (!inserted) {
      return NextResponse.json({ error: 'user_create_failed' }, { status: 500 });
    }
    user = inserted;
  }

  // Mint a session row. 30-day expiry matches Auth.js config in lib/auth/index.ts.
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(schema.sessions).values({
    sessionToken,
    userId: user.id,
    expires,
  });

  const isHttps = req.nextUrl.protocol === 'https:';
  const cookieName = isHttps ? COOKIE_SECURE : COOKIE_INSECURE;

  const returnTo = req.nextUrl.searchParams.get('return_to') ?? '/dashboard';
  const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/dashboard';

  const res = NextResponse.redirect(new URL(safeReturnTo, req.url));
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    expires,
  });
  return res;
});
