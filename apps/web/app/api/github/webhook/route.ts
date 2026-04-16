/**
 * POST /api/github/webhook
 *
 * GitHub App webhook handler. Listens for `push` events on connected
 * repos and triggers a build + deploy cycle.
 *
 * C3 behavior: the webhook returns 202 Accepted immediately. The actual
 * clone + build + deploy runs in `after()`. While the pipeline is running,
 * a `apps:{slug}:building` KV entry tells the Worker to serve a
 * "building…" placeholder instead of a 404 (for first deploys) or keep
 * serving the prior active version (for rebuilds).
 *
 * Verification: checks X-Hub-Signature-256 against GITHUB_WEBHOOK_SECRET.
 *
 * Spec v5 §4. Differentiation plan Pillar C3.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { DevKv, getDevKvDir } from '@shippie/dev-storage';
import { getDb } from '@/lib/db';
import { getInstallationToken } from '@/lib/github/app';
import { cloneRepo } from '@/lib/github/clone';
import { buildFromDirectory } from '@/lib/build';
import { deployStaticHot, deployCold } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BuildingFlag {
  commit_sha: string | null;
  started_at: number;
  source: 'github_webhook';
}

export const POST = withLogger('github.webhook', async (req: NextRequest) => {
  const rawBody = await req.text();

  // Verify webhook signature
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
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
    after?: string;
    head_commit?: { id: string };
    repository: { full_name: string; clone_url: string };
    installation?: { id: number };
  };

  const branch = payload.ref.replace('refs/heads/', '');
  const repoFullName = payload.repository.full_name;
  const commitSha = payload.after ?? payload.head_commit?.id ?? null;

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

  // Flag the slug as building so the Worker shows a "building…" page
  // on first deploys (or leaves the prior version serving on rebuilds).
  const kv = new DevKv(getDevKvDir());
  const buildingKey = `apps:${app.slug}:building`;
  const flag: BuildingFlag = {
    commit_sha: commitSha,
    started_at: Date.now(),
    source: 'github_webhook',
  };
  await kv.putJson(buildingKey, flag, { expirationTtl: 60 * 10 }); // 10-minute safety TTL

  // Return 202 immediately. The clone + build + deploy pipeline runs in
  // after() and typically takes 1-3 minutes for a cold build.
  after(async () => {
    try {
      let token: string | undefined;
      if (app.githubInstallationId && payload.installation?.id) {
        try {
          token = await getInstallationToken(payload.installation.id);
        } catch {
          // Fall back to unauthenticated clone (public repos)
        }
      }

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
        console.error('[shippie:github-webhook] build_failed:', build.reason);
        return;
      }

      const reservedSlugs = await loadReservedSlugs();
      const hot = await deployStaticHot({
        slug: app.slug,
        makerId: app.makerId,
        zipBuffer: build.zipBuffer,
        reservedSlugs,
      });

      if (!hot.success) {
        console.error('[shippie:github-webhook] deploy_hot_failed:', hot.reason);
        return;
      }

      if (hot.appId && hot.deployId && hot.filesForCold && hot.manifestForCold) {
        await deployCold({
          appId: hot.appId,
          deployId: hot.deployId,
          slug: app.slug,
          version: hot.version,
          files: hot.filesForCold,
          manifest: hot.manifestForCold,
        });
      }
    } catch (err) {
      console.error('[shippie:github-webhook] pipeline_error:', err);
    } finally {
      // Always clear the building flag so the Worker stops showing the
      // placeholder. If the deploy failed, the prior active version (or
      // the unpublished page for first-deploy failures) stays visible.
      try {
        await kv.delete(buildingKey);
      } catch {
        // TTL will clean it up
      }
    }
  });

  return NextResponse.json(
    {
      accepted: true,
      slug: app.slug,
      commit_sha: commitSha,
    },
    { status: 202 },
  );
});
