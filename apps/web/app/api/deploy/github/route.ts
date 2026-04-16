/**
 * POST /api/deploy/github
 *
 * Clones a public GitHub repo, builds it, and deploys to Shippie.
 * Used by the deploy button + the /deploy page.
 *
 * Request (form or JSON): { repo_url, slug, branch? }
 *
 * Spec v5 §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { cloneRepo } from '@/lib/github/clone';
import { buildFromDirectory } from '@/lib/build';
import { deployStatic } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.github', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let repoUrl: string;
  let slug: string;
  let branch: string | undefined;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('form')) {
    const form = await req.formData();
    repoUrl = String(form.get('repo_url') ?? '').trim();
    slug = String(form.get('slug') ?? '').trim();
    branch = String(form.get('branch') ?? '') || undefined;
  } else {
    const body = (await req.json().catch(() => ({}))) as { repo_url?: string; slug?: string; branch?: string };
    repoUrl = (body.repo_url ?? '').trim();
    slug = (body.slug ?? '').trim();
    branch = body.branch;
  }

  if (!repoUrl || !slug) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Clone (public, no token)
  const cloneDir = await cloneRepo({ repoUrl, branch });

  const build = await buildFromDirectory({ sourceDir: cloneDir });
  if (!build.success || !build.zipBuffer) {
    return NextResponse.json(
      { error: 'build_failed', reason: build.reason },
      { status: 400 },
    );
  }

  const reservedSlugs = await loadReservedSlugs();
  const deploy = await deployStatic({
    slug,
    makerId: session.user.id,
    zipBuffer: build.zipBuffer,
    reservedSlugs,
  });

  if (!deploy.success) {
    return NextResponse.json({ error: 'deploy_failed', reason: deploy.reason }, { status: 400 });
  }

  // If form submission, redirect to the app detail page
  if (contentType.includes('form')) {
    return NextResponse.redirect(new URL(`/apps/${slug}`, req.url), 303);
  }

  return NextResponse.json({
    success: true,
    slug,
    version: deploy.version,
    live_url: deploy.liveUrl,
  });
});
