/**
 * GET /api/github/repos?installation_id=X
 *
 * Lists repos accessible to the given GitHub App installation. Callers
 * must own the installation row (current session user == installation.user_id).
 *
 * Used by the /new?source=github repo picker.
 *
 * Spec v5 §4.
 */
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getInstallationToken } from '@/lib/github/app';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RepoRow {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  description: string | null;
}

export const GET = withLogger('github.repos.list', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const installationId = Number(req.nextUrl.searchParams.get('installation_id') ?? '0');
  if (!installationId) {
    return NextResponse.json({ error: 'missing_installation_id' }, { status: 400 });
  }

  const db = await getDb();
  const install = await db.query.githubInstallations.findFirst({
    where: eq(schema.githubInstallations.githubInstallationId, installationId),
  });
  if (!install || install.userId !== session.user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const token = await getInstallationToken(installationId);

  // GitHub caps at 100 per page. Most users have far fewer accessible repos
  // via an installation; if someone has >100 we'll add pagination later.
  const ghRes = await fetch(
    'https://api.github.com/installation/repositories?per_page=100&sort=pushed',
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    },
  );

  if (!ghRes.ok) {
    return NextResponse.json(
      { error: 'github_fetch_failed', status: ghRes.status },
      { status: 502 },
    );
  }

  const body = (await ghRes.json()) as { repositories: RepoRow[]; total_count: number };

  return NextResponse.json({
    total_count: body.total_count,
    repos: body.repositories.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      private: r.private,
      default_branch: r.default_branch,
      pushed_at: r.pushed_at,
      language: r.language,
      description: r.description,
    })),
  });
});
