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
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { cloneRepo } from '@/lib/github/clone';
import { getInstallationToken } from '@/lib/github/app';
import { buildFromDirectory } from '@/lib/build';
import { deployStaticHot, deployCold } from '@/lib/deploy';
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
  let installationId: number | null = null;
  let repoFullName: string | null = null;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('form')) {
    const form = await req.formData();
    repoUrl = String(form.get('repo_url') ?? '').trim();
    slug = String(form.get('slug') ?? '').trim();
    branch = String(form.get('branch') ?? '') || undefined;
    const instId = String(form.get('installation_id') ?? '');
    if (instId) installationId = Number(instId);
    repoFullName = String(form.get('repo_full_name') ?? '').trim() || null;
  } else {
    const body = (await req.json().catch(() => ({}))) as {
      repo_url?: string;
      slug?: string;
      branch?: string;
      installation_id?: number | string;
      repo_full_name?: string;
    };
    repoUrl = (body.repo_url ?? '').trim();
    slug = (body.slug ?? '').trim();
    branch = body.branch;
    installationId = body.installation_id != null ? Number(body.installation_id) : null;
    repoFullName = body.repo_full_name?.trim() ?? null;
  }

  if (!repoUrl || !slug) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // If an installation_id was provided, verify the caller owns it and mint
  // a token so we can clone private repos.
  let cloneToken: string | undefined;
  if (installationId) {
    const db = await getDb();
    const install = await db.query.githubInstallations.findFirst({
      where: eq(schema.githubInstallations.githubInstallationId, installationId),
    });
    if (!install || install.userId !== session.user.id) {
      return NextResponse.json({ error: 'installation_forbidden' }, { status: 403 });
    }
    try {
      cloneToken = await getInstallationToken(installationId);
    } catch (err) {
      return NextResponse.json(
        { error: 'installation_token_failed', reason: (err as Error).message },
        { status: 502 },
      );
    }
  }

  const cloneDir = await cloneRepo({ repoUrl, branch, token: cloneToken });

  const build = await buildFromDirectory({ sourceDir: cloneDir });
  if (!build.success || !build.zipBuffer) {
    return NextResponse.json(
      { error: 'build_failed', reason: build.reason },
      { status: 400 },
    );
  }

  const reservedSlugs = await loadReservedSlugs();
  const deploy = await deployStaticHot({
    slug,
    makerId: session.user.id,
    zipBuffer: build.zipBuffer,
    reservedSlugs,
  });

  if (!deploy.success) {
    return NextResponse.json({ error: 'deploy_failed', reason: deploy.reason }, { status: 400 });
  }

  // Link the newly-created (or re-used) app row to the GitHub repo so
  // future webhook pushes find it and can mint installation tokens.
  if (deploy.appId && (installationId || repoFullName)) {
    const db = await getDb();
    await db
      .update(schema.apps)
      .set({
        sourceType: 'github',
        githubRepo: repoFullName,
        githubInstallationId: installationId,
        githubBranch: branch ?? 'main',
        updatedAt: new Date(),
      })
      .where(eq(schema.apps.id, deploy.appId));
  }

  if (deploy.appId && deploy.deployId && deploy.filesForCold && deploy.manifestForCold) {
    const { appId, deployId, filesForCold, manifestForCold } = deploy;
    after(() =>
      deployCold({
        appId,
        deployId,
        slug,
        version: deploy.version,
        files: filesForCold,
        manifest: manifestForCold,
      }),
    );
  }

  // If form submission, redirect to the app detail page
  if (contentType.includes('form')) {
    return NextResponse.redirect(new URL(`/apps/${slug}`, req.url), 303);
  }

  return NextResponse.json({
    success: true,
    slug,
    version: deploy.version,
    deploy_id: deploy.deployId,
    live_url: deploy.liveUrl,
  });
});
