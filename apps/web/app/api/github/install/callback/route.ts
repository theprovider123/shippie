/**
 * GET /api/github/install/callback
 *
 * Landing point after the user installs the Shippie GitHub App on
 * github.com. GitHub sends:
 *
 *   installation_id   — numeric installation ID
 *   setup_action      — 'install' | 'update' | 'request'
 *   state             — CSRF token round-tripped from /api/github/install
 *
 * We fetch the installation metadata via the GitHub App JWT, upsert
 * a github_installations row bound to the current user, then redirect
 * to /new?source=github&installation_id=X so the maker can pick a repo.
 *
 * Spec v5 §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { generateAppJwt } from '@/lib/github/app';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GithubInstallationResponse {
  id: number;
  account:
    | { login: string; type: 'User' }
    | { login: string; type: 'Organization' }
    | null;
  repository_selection: 'all' | 'selected';
  permissions?: Record<string, string>;
  suspended_at?: string | null;
}

export const GET = withLogger('github.install.callback', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/auth/signin?return_to=/new', req.url));
  }

  const installationId = Number(req.nextUrl.searchParams.get('installation_id') ?? '0');
  const stateParam = req.nextUrl.searchParams.get('state') ?? '';
  const setupAction = req.nextUrl.searchParams.get('setup_action') ?? 'install';

  if (!installationId) {
    return NextResponse.json({ error: 'missing_installation_id' }, { status: 400 });
  }

  const csrfCookie = req.cookies.get('shippie_gh_install_csrf')?.value;
  if (csrfCookie && stateParam && csrfCookie !== stateParam) {
    return NextResponse.json({ error: 'csrf_mismatch' }, { status: 400 });
  }

  // Fetch installation metadata from GitHub using the App JWT.
  const jwt = generateAppJwt();
  const ghRes = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });

  if (!ghRes.ok) {
    return NextResponse.json(
      { error: 'github_fetch_failed', status: ghRes.status, body: await ghRes.text() },
      { status: 502 },
    );
  }

  const installation = (await ghRes.json()) as GithubInstallationResponse;

  if (!installation.account) {
    return NextResponse.json({ error: 'installation_account_missing' }, { status: 500 });
  }

  const db = await getDb();
  const existing = await db.query.githubInstallations.findFirst({
    where: eq(schema.githubInstallations.githubInstallationId, installation.id),
  });

  if (existing) {
    await db
      .update(schema.githubInstallations)
      .set({
        userId: session.user.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        repositorySelection: installation.repository_selection,
        permissions: installation.permissions ?? null,
        suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.githubInstallations.id, existing.id));
  } else {
    await db.insert(schema.githubInstallations).values({
      githubInstallationId: installation.id,
      userId: session.user.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositorySelection: installation.repository_selection,
      permissions: installation.permissions ?? null,
      suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
    });
  }

  const redirect = new URL('/new', req.url);
  redirect.searchParams.set('source', 'github');
  redirect.searchParams.set('installation_id', String(installation.id));
  redirect.searchParams.set('setup_action', setupAction);

  const res = NextResponse.redirect(redirect);
  res.cookies.delete('shippie_gh_install_csrf');
  return res;
});
