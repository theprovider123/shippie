/**
 * POST /api/v1/webhook/github
 *
 * GitHub App webhook receiver. Listens for:
 *   - `push`                       → trigger a fresh build via /api/deploy/github flow
 *   - `installation`               → upsert/delete github_installations row
 *   - `installation_repositories`  → noop (we don't track per-repo grants yet)
 *
 * Verification: X-Hub-Signature-256 against GITHUB_WEBHOOK_SECRET
 * (HMAC-SHA256 of raw body, hex-encoded).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { verifySha256Signature } from '$server/internal/hmac';
import { getInstallationToken } from '$server/github/app';

const WORKFLOW_FILE = 'shippie-build.yml';

interface PushPayload {
  ref?: string;
  after?: string;
  head_commit?: { id?: string } | null;
  repository?: { full_name?: string; clone_url?: string };
  installation?: { id?: number };
}

interface InstallationPayload {
  action?: string;
  installation?: {
    id?: number;
    account?: { login?: string; type?: string } | null;
    repository_selection?: string;
    permissions?: Record<string, unknown>;
    suspended_at?: string | null;
  };
  sender?: { id?: number; login?: string };
}

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'platform bindings unavailable');

  const secret = (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return json({ error: 'webhook_secret_not_configured' }, { status: 503 });
  }

  const rawBody = await event.request.text();
  const sig = event.request.headers.get('x-hub-signature-256');
  if (!(await verifySha256Signature(secret, rawBody, sig))) {
    return json({ error: 'invalid_signature' }, { status: 401 });
  }

  const ghEvent = event.request.headers.get('x-github-event') ?? '';
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);

  if (ghEvent === 'installation') {
    const p = payload as InstallationPayload;
    const inst = p.installation;
    if (!inst?.id || !inst.account?.login || !inst.account.type) {
      return json({ ok: true, ignored: 'incomplete_installation' });
    }

    if (p.action === 'deleted') {
      await db
        .delete(schema.githubInstallations)
        .where(eq(schema.githubInstallations.githubInstallationId, inst.id));
      return json({ ok: true, action: 'deleted' });
    }

    // upsert/update — but we don't have a userId from the webhook, so we
    // only update an existing row (the user-scoped install row is created
    // by the OAuth callback).
    const existing = await db.query.githubInstallations.findFirst({
      where: eq(schema.githubInstallations.githubInstallationId, inst.id),
    });
    if (existing) {
      await db
        .update(schema.githubInstallations)
        .set({
          accountLogin: inst.account.login,
          accountType: inst.account.type,
          repositorySelection: inst.repository_selection ?? existing.repositorySelection,
          permissions: (inst.permissions as Record<string, unknown>) ?? existing.permissions,
          suspendedAt: inst.suspended_at ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.githubInstallations.id, existing.id));
    }
    return json({ ok: true, action: p.action ?? 'unknown' });
  }

  if (ghEvent === 'installation_repositories') {
    return json({ ok: true, ignored: 'per_repo_grants_not_tracked' });
  }

  if (ghEvent === 'push') {
    const p = payload as PushPayload;
    const branch = (p.ref ?? '').replace(/^refs\/heads\//, '');
    const repoFullName = p.repository?.full_name;
    const cloneUrl = p.repository?.clone_url;
    const commitSha = p.after ?? p.head_commit?.id ?? null;
    if (!branch || !repoFullName || !cloneUrl) {
      return json({ ok: true, ignored: 'incomplete_push' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(schema.apps.githubRepo, repoFullName),
    });
    if (!app) return json({ ok: true, ignored: 'no_app_linked' });
    if (branch !== app.githubBranch) {
      return json({ ok: true, ignored: 'wrong_branch', branch, app_branch: app.githubBranch });
    }

    // Insert deploys row + dispatch.
    const ghAppId = (env as { GITHUB_APP_ID?: string }).GITHUB_APP_ID;
    const ghPrivateKey = (env as { GITHUB_APP_PRIVATE_KEY?: string }).GITHUB_APP_PRIVATE_KEY;
    const ownInstallationId = (env as { GITHUB_PLATFORM_INSTALLATION_ID?: string }).GITHUB_PLATFORM_INSTALLATION_ID;
    const repoOwner = (env as { GITHUB_PLATFORM_REPO_OWNER?: string }).GITHUB_PLATFORM_REPO_OWNER ?? 'shippie-app';
    const repoName = (env as { GITHUB_PLATFORM_REPO_NAME?: string }).GITHUB_PLATFORM_REPO_NAME ?? 'platform';

    if (!ghAppId || !ghPrivateKey || !ownInstallationId) {
      return json({ error: 'gh_dispatch_not_configured' }, { status: 503 });
    }

    // Insert deploy row with a fresh version
    const latest = await db.query.deploys.findFirst({
      where: eq(schema.deploys.appId, app.id),
      orderBy: (d, { desc }) => [desc(d.version)],
    });
    const version = (latest?.version ?? 0) + 1;

    const [deployRow] = await db
      .insert(schema.deploys)
      .values({
        appId: app.id,
        version,
        sourceType: 'github',
        sourceKind: 'github',
        sourceRef: branch,
        commitSha,
        status: 'building',
        createdBy: app.makerId,
      })
      .returning();
    if (!deployRow) return json({ error: 'deploy_row_create_failed' }, { status: 500 });

    let workflowRepoUrl = cloneUrl;
    if (p.installation?.id != null) {
      try {
        const cloneToken = await getInstallationToken({
          appId: ghAppId,
          privateKey: ghPrivateKey,
          installationId: p.installation.id,
        });
        const u = new URL(cloneUrl);
        u.username = 'x-access-token';
        u.password = cloneToken;
        workflowRepoUrl = u.toString();
      } catch (err) {
        console.warn('[webhook:github] clone-token mint failed', err);
      }
    }

    let platformToken: string;
    try {
      platformToken = await getInstallationToken({
        appId: ghAppId,
        privateKey: ghPrivateKey,
        installationId: Number(ownInstallationId),
      });
    } catch (err) {
      await db
        .update(schema.deploys)
        .set({ status: 'failed', errorMessage: 'platform_app_token_failed: ' + (err as Error).message })
        .where(eq(schema.deploys.id, deployRow.id));
      return json({ error: 'platform_token_failed', reason: (err as Error).message }, { status: 502 });
    }

    const callbackBase = env.PUBLIC_ORIGIN ?? 'https://shippie.app';
    const dispatchUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${platformToken}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'shippie-platform/1.0',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          repo_url: workflowRepoUrl,
          slug: app.slug,
          deploy_id: deployRow.id,
          version: String(version),
          callback_url: `${callbackBase}/api/v1/deploy/callback`,
          branch,
        },
      }),
    });

    if (!dispatchRes.ok) {
      const reason = `github_dispatch_failed: ${dispatchRes.status} ${await dispatchRes.text().catch(() => '')}`;
      await db
        .update(schema.deploys)
        .set({ status: 'failed', errorMessage: reason })
        .where(eq(schema.deploys.id, deployRow.id));
      return json({ error: 'gh_dispatch_failed', reason }, { status: 502 });
    }

    return json(
      { accepted: true, slug: app.slug, deploy_id: deployRow.id, version, commit_sha: commitSha },
      { status: 202 },
    );
  }

  return json({ ok: true, ignored: ghEvent });
};
