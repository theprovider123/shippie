/**
 * POST /api/deploy/path
 *
 * Local-directory deploy. Takes an absolute path on the platform host,
 * runs the build pipeline (detect → install → build → zip), and feeds
 * the zip into the existing static deploy flow.
 *
 * This is the dev entry point for anything that isn't a pre-built zip:
 * CI adapters, local `shippie deploy ./my-app`, and the GitHub webhook
 * (which clones to a tmp dir first). Production will swap the local
 * subprocess for a Vercel Sandbox invocation without changing this API.
 *
 * Request body (JSON):
 *   { slug: string, source_dir: string, skip_build?: boolean }
 *
 * Spec v6 §10.5, §10.6.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { auth } from '@/lib/auth';
import { buildFromDirectory } from '@/lib/build';
import { deployStaticHot, deployCold } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs.ts';
import { checkRateLimit } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.path', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Rate limit: 30 deploys / minute / maker
  const rl = checkRateLimit({
    key: `deploy:${session.user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    source_dir?: string;
    skip_build?: boolean;
  };
  const slug = (body.slug ?? '').trim();
  const sourceDir = (body.source_dir ?? '').trim();

  if (!slug) return NextResponse.json({ error: 'missing slug' }, { status: 400 });
  if (!sourceDir) return NextResponse.json({ error: 'missing source_dir' }, { status: 400 });
  if (!sourceDir.startsWith('/')) {
    return NextResponse.json({ error: 'source_dir must be absolute' }, { status: 400 });
  }

  const build = await buildFromDirectory({
    sourceDir,
    skipBuild: body.skip_build ?? false,
  });

  if (!build.success || !build.zipBuffer) {
    return NextResponse.json(
      {
        error: 'build_failed',
        reason: build.reason,
        detection: build.detection,
        logs: build.logs.slice(-50),
      },
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
    return NextResponse.json(
      { error: 'deploy_failed', reason: deploy.reason, preflight: deploy.preflight },
      { status: 400 },
    );
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

  return NextResponse.json({
    success: true,
    slug,
    version: deploy.version,
    deploy_id: deploy.deployId,
    files: deploy.files,
    total_bytes: deploy.totalBytes,
    live_url: deploy.liveUrl,
    detection: build.detection,
    build_duration_ms: build.durationMs,
    file_count: build.fileCount,
  });
});
