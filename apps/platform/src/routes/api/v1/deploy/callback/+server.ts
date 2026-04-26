/**
 * POST /api/v1/deploy/callback
 *
 * Receiver for the shippie-build.yml workflow. The GH Actions runner
 * POSTs here when the build either succeeds (R2 upload done) or fails.
 *
 * HMAC verification:
 *   X-Shippie-Signature: sha256=<hex(hmac_sha256(WORKER_PLATFORM_SECRET, raw_body))>
 *
 * Body shapes:
 *   success: { deploy_id, slug, status: 'success', commit_sha, version, files_count, total_bytes }
 *   failure: { deploy_id, slug, status: 'failed', error }
 *
 * On success we mark the deploy row, flip apps.active_deploy_id, and
 * write the apps:{slug}:active KV pointer.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { verifySha256Signature } from '$server/internal/hmac';
import { writeActivePointer, writeAppMeta } from '$server/deploy/kv-write';

interface SuccessBody {
  deploy_id: string;
  slug: string;
  status: 'success';
  commit_sha?: string;
  version: number;
  files_count: number;
  total_bytes: number;
}

interface FailureBody {
  deploy_id: string;
  slug: string;
  status: 'failed';
  error?: string;
}

type CallbackBody = SuccessBody | FailureBody;

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const secret = (env as { WORKER_PLATFORM_SECRET?: string }).WORKER_PLATFORM_SECRET;
  if (!secret) {
    return json({ error: 'callback_secret_not_configured' }, { status: 503 });
  }

  const rawBody = await event.request.text();
  const sig = event.request.headers.get('x-shippie-signature');
  const valid = await verifySha256Signature(secret, rawBody, sig);
  if (!valid) {
    return json({ error: 'invalid_signature' }, { status: 401 });
  }

  let body: CallbackBody;
  try {
    body = JSON.parse(rawBody) as CallbackBody;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  if (typeof body.deploy_id !== 'string' || typeof body.slug !== 'string') {
    return json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);
  const deployRow = await db.query.deploys.findFirst({
    where: eq(schema.deploys.id, body.deploy_id),
  });
  if (!deployRow) {
    return json({ error: 'unknown_deploy' }, { status: 404 });
  }

  const completedAt = new Date().toISOString();

  if (body.status === 'failed') {
    await db
      .update(schema.deploys)
      .set({
        status: 'failed',
        completedAt,
        errorMessage: typeof body.error === 'string' ? body.error.slice(0, 1000) : 'unknown',
      })
      .where(eq(schema.deploys.id, body.deploy_id));
    console.log(`[deploy:callback] failure deploy_id=${body.deploy_id} slug=${body.slug}`);
    return json({ ok: true, status: 'failed' });
  }

  // SUCCESS path.
  if (typeof body.version !== 'number' || typeof body.files_count !== 'number' || typeof body.total_bytes !== 'number') {
    return json({ error: 'invalid_success_body' }, { status: 400 });
  }

  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, deployRow.appId) });
  if (!app) {
    return json({ error: 'orphan_deploy' }, { status: 500 });
  }

  await db.insert(schema.deployArtifacts).values({
    deployId: deployRow.id,
    r2Prefix: `apps/${body.slug}/v${body.version}`,
    fileCount: body.files_count,
    totalBytes: body.total_bytes,
    manifest: { source: 'github_actions', commit_sha: body.commit_sha ?? null },
  });

  await db
    .update(schema.deploys)
    .set({
      status: 'success',
      completedAt,
      commitSha: body.commit_sha ?? null,
    })
    .where(eq(schema.deploys.id, deployRow.id));

  await db
    .update(schema.apps)
    .set({
      activeDeployId: deployRow.id,
      latestDeployId: deployRow.id,
      latestDeployStatus: 'success',
      lastDeployedAt: completedAt,
      firstPublishedAt: app.firstPublishedAt ?? completedAt,
      updatedAt: completedAt,
    })
    .where(eq(schema.apps.id, app.id));

  await writeAppMeta(env.CACHE, body.slug, {
    slug: body.slug,
    name: app.name,
    type: app.type,
    theme_color: app.themeColor,
    background_color: app.backgroundColor,
    version: body.version,
    visibility_scope: app.visibilityScope,
  });
  await writeActivePointer(env.CACHE, body.slug, body.version);

  console.log(
    `[deploy:callback] success deploy_id=${body.deploy_id} slug=${body.slug} files=${body.files_count} bytes=${body.total_bytes}`,
  );

  return json({ ok: true, status: 'success' });
};
