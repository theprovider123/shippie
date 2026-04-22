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
import { z } from 'zod';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { cloneRepo } from '@/lib/github/clone';
import { getInstallationToken } from '@/lib/github/app';
import { buildFromDirectory } from '@/lib/build';
import { hostBuildsEnabled, hostBuildsDisabledReason } from '@/lib/build/policy';
import { deployStaticHot, deployCold } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs';
import { parseValue } from '@/lib/internal/validation';
import { withLogger } from '@/lib/observability/logger';

const DeployGithubSchema = z.object({
  repo_url: z.string().min(1),
  slug: z.string().min(1),
  branch: z.string().optional(),
  installation_id: z.coerce.number().int().positive().optional(),
  repo_full_name: z.string().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.github', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!hostBuildsEnabled()) {
    return NextResponse.json(
      {
        error: 'host_builds_disabled',
        reason: hostBuildsDisabledReason(),
      },
      { status: 503 },
    );
  }

  const contentType = req.headers.get('content-type') ?? '';
  let raw: unknown;
  if (contentType.includes('form')) {
    const form = await req.formData();
    const installId = String(form.get('installation_id') ?? '').trim();
    raw = {
      repo_url: String(form.get('repo_url') ?? '').trim(),
      slug: String(form.get('slug') ?? '').trim(),
      branch: String(form.get('branch') ?? '').trim() || undefined,
      installation_id: installId ? installId : undefined,
      repo_full_name: String(form.get('repo_full_name') ?? '').trim() || undefined,
    };
  } else {
    try {
      raw = await req.json();
    } catch (err) {
      return NextResponse.json(
        { error: 'invalid_json', message: (err as Error).message },
        { status: 400 },
      );
    }
  }

  const parsed = parseValue(raw, DeployGithubSchema);
  if (!parsed.ok) return parsed.response;
  const repoUrl = parsed.data.repo_url;
  const slug = parsed.data.slug;
  const branch = parsed.data.branch;
  const installationId = parsed.data.installation_id ?? null;
  const repoFullName = parsed.data.repo_full_name ?? null;

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
    console.warn(
      '[shippie:deploy-github] build_failed',
      JSON.stringify({ slug, repo: repoFullName, reason: build.reason, last_logs: build.logs.slice(-10) }, null, 2),
    );
    return NextResponse.json(
      { error: 'build_failed', reason: build.reason, logs: build.logs.slice(-20) },
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
    console.warn(
      '[shippie:deploy-github] deploy_failed',
      JSON.stringify({ slug, reason: deploy.reason, preflight: deploy.preflight }, null, 2),
    );
    return NextResponse.json(
      { error: 'deploy_failed', reason: deploy.reason, preflight: deploy.preflight },
      { status: 400 },
    );
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
