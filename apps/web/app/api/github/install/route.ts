/**
 * GET /api/github/install
 *
 * Kick off the GitHub App install flow. Redirects to
 *   https://github.com/apps/{slug}/installations/new?state={csrf}
 *
 * Requires env:
 *   GITHUB_APP_SLUG           — the URL-slug of the Shippie GitHub App
 *
 * After the user picks repos on GitHub, they land at
 *   /api/github/install/callback?installation_id=X&setup_action=install&state=…
 *
 * Spec v5 §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withLogger('github.install.start', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    const returnUrl = req.nextUrl.pathname + req.nextUrl.search;
    return NextResponse.redirect(
      new URL(`/auth/signin?return_to=${encodeURIComponent(returnUrl)}`, req.url),
    );
  }

  const appSlug = process.env.GITHUB_APP_SLUG;
  if (!appSlug) {
    return NextResponse.json(
      {
        error: 'misconfigured',
        reason:
          'GITHUB_APP_SLUG is not set. Configure the Shippie GitHub App before inviting users to install.',
      },
      { status: 500 },
    );
  }

  // Round-trip a CSRF token through GitHub's `state` parameter so the
  // callback can verify the install flow was initiated by this session.
  const csrf = randomBytes(16).toString('hex');
  const githubUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  githubUrl.searchParams.set('state', csrf);

  const res = NextResponse.redirect(githubUrl);
  res.cookies.set('shippie_gh_install_csrf', csrf, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  return res;
});
