/**
 * POST /api/github/webhook
 *
 * GitHub App webhook handler. Listens for `push` events on connected
 * repos and triggers a build + deploy cycle.
 *
 * Verification: checks X-Hub-Signature-256 against GITHUB_WEBHOOK_SECRET.
 *
 * Spec v5 §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { getInstallationToken } from '@/lib/github/app';
import { cloneRepo } from '@/lib/github/clone';
import { buildFromDirectory } from '@/lib/build';
import { deployStatic } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('github.webhook', async (req: NextRequest) => {
  const rawBody = await req.text();

  // Verify webhook signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-hub-signature-256');
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    if (sig !== expected) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  }

  const event = req.headers.get('x-github-event');
  if (event !== 'push') {
    return NextResponse.json({ ignored: true, event });
  }

  const payload = JSON.parse(rawBody) as {
    ref: string;
    repository: { full_name: string; clone_url: string };
    installation?: { id: number };
  };

  const branch = payload.ref.replace('refs/heads/', '');
  const repoFullName = payload.repository.full_name;

  const db = await getDb();
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.githubRepo, repoFullName),
  });
  if (!app) {
    return NextResponse.json({ ignored: true, reason: 'no_app_linked' });
  }
  if (branch !== app.githubBranch) {
    return NextResponse.json({ ignored: true, reason: 'wrong_branch' });
  }

  // Get installation token for private repo access
  let token: string | undefined;
  if (app.githubInstallationId && payload.installation?.id) {
    try {
      token = await getInstallationToken(payload.installation.id);
    } catch {
      // Fall back to unauthenticated clone (public repos)
    }
  }

  // Clone → build → deploy
  const cloneDir = await cloneRepo({
    repoUrl: payload.repository.clone_url,
    branch,
    token,
  });

  const build = await buildFromDirectory({
    sourceDir: cloneDir,
    skipBuild: false,
  });

  if (!build.success || !build.zipBuffer) {
    return NextResponse.json(
      { error: 'build_failed', reason: build.reason, logs: build.logs.slice(-20) },
      { status: 400 },
    );
  }

  const reservedSlugs = await loadReservedSlugs();
  const deploy = await deployStatic({
    slug: app.slug,
    makerId: app.makerId,
    zipBuffer: build.zipBuffer,
    reservedSlugs,
  });

  return NextResponse.json({
    success: deploy.success,
    slug: app.slug,
    version: deploy.version,
    live_url: deploy.liveUrl,
  });
});
