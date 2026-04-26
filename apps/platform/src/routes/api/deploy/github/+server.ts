/**
 * POST /api/deploy/github
 *
 * Trigger a GitHub Actions workflow_dispatch to clone, build, and upload
 * the maker's repo to R2. Honest expected runtime: 2-5 minutes.
 *
 * Body (JSON or form):
 *   { repo_url, slug, branch?, installation_id?, repo_full_name? }
 *
 * Flow:
 *   1. Authenticate the caller via session OR CLI bearer token.
 *   2. Verify the caller owns the GitHub installation (if provided).
 *   3. Insert a deploys row with status='building', source_type='github'.
 *   4. POST workflow_dispatch to .github/workflows/shippie-build.yml.
 *   5. Return { deploy_id, status: 'building' }.
 *
 * The workflow POSTs back to /api/v1/deploy/callback when done.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getInstallationToken, generateAppJwt } from '$server/github/app';

const SHIPPIE_REPO_OWNER = 'shippie-app'; // adjust at deploy time via env if needed
const SHIPPIE_REPO_NAME = 'platform';
const WORKFLOW_FILE = 'shippie-build.yml';

interface DispatchInput {
  repo_url: string;
  slug: string;
  branch: string;
  installation_id: number | null;
  repo_full_name: string | null;
}

function parseInput(raw: Record<string, unknown>): DispatchInput | { error: string } {
  const repoUrl = typeof raw.repo_url === 'string' ? raw.repo_url.trim() : '';
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  const branch = (typeof raw.branch === 'string' && raw.branch.trim()) || 'main';
  const repoFullName =
    typeof raw.repo_full_name === 'string' && raw.repo_full_name.trim().length > 0
      ? raw.repo_full_name.trim()
      : null;
  const rawId = raw.installation_id;
  let installationId: number | null = null;
  if (typeof rawId === 'number') installationId = rawId;
  else if (typeof rawId === 'string' && rawId.length > 0) {
    const n = Number(rawId);
    installationId = Number.isFinite(n) ? n : null;
  }

  if (!repoUrl || !/^https:\/\/github\.com\/[^/]+\/[^/]+(\.git)?$/.test(repoUrl)) {
    return { error: 'invalid_repo_url' };
  }
  if (!/^[a-z0-9-]{1,63}$/.test(slug)) {
    return { error: 'invalid_slug' };
  }
  if (!/^[\w./-]+$/.test(branch)) {
    return { error: 'invalid_branch' };
  }

  return { repo_url: repoUrl, slug, branch, installation_id: installationId, repo_full_name: repoFullName };
}

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const contentType = event.request.headers.get('content-type') ?? '';
  let raw: Record<string, unknown> = {};
  if (contentType.includes('form')) {
    const form = await event.request.formData();
    raw = Object.fromEntries(form.entries());
  } else {
    try {
      raw = (await event.request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'invalid_json' }, { status: 400 });
    }
  }

  const parsed = parseInput(raw);
  if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });

  const db = getDrizzleClient(env.DB);

  // 1. If an installation_id was supplied, verify ownership.
  if (parsed.installation_id != null) {
    const install = await db.query.githubInstallations.findFirst({
      where: eq(schema.githubInstallations.githubInstallationId, parsed.installation_id),
    });
    if (!install || install.userId !== who.userId) {
      return json({ error: 'installation_forbidden' }, { status: 403 });
    }
  }

  // 2. Resolve or create the apps row, then determine version.
  let app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, parsed.slug),
  });
  if (app && app.makerId !== who.userId) {
    return json({ error: 'slug_taken' }, { status: 409 });
  }
  if (!app) {
    const [inserted] = await db
      .insert(schema.apps)
      .values({
        slug: parsed.slug,
        name: parsed.slug,
        type: 'web_app',
        category: 'other',
        sourceType: 'github',
        makerId: who.userId,
        githubRepo: parsed.repo_full_name,
        githubBranch: parsed.branch,
        githubInstallationId: parsed.installation_id ?? null,
      })
      .returning();
    if (!inserted) return json({ error: 'app_create_failed' }, { status: 500 });
    app = inserted;
  } else {
    await db
      .update(schema.apps)
      .set({
        sourceType: 'github',
        githubRepo: parsed.repo_full_name ?? app.githubRepo,
        githubBranch: parsed.branch,
        githubInstallationId: parsed.installation_id ?? app.githubInstallationId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.apps.id, app.id));
  }

  const latest = await db
    .select({ version: schema.deploys.version })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, app.id))
    .orderBy(desc(schema.deploys.version))
    .limit(1);
  const version = (latest[0]?.version ?? 0) + 1;

  const [deployRow] = await db
    .insert(schema.deploys)
    .values({
      appId: app.id,
      version,
      sourceType: 'github',
      sourceKind: 'github',
      sourceRef: parsed.branch,
      status: 'building',
      createdBy: who.userId,
    })
    .returning();
  if (!deployRow) return json({ error: 'deploy_row_create_failed' }, { status: 500 });

  // 3. Trigger the GH Actions workflow_dispatch.
  //
  //    Authenticated as the Shippie GitHub App on its own installation in
  //    the platform repo. The maker's installation token is for cloning
  //    only — that's passed into the workflow as part of repo_url already
  //    (the workflow accepts an https URL with embedded user:token if
  //    private repos need it).
  const ghAppId = (env as { GITHUB_APP_ID?: string }).GITHUB_APP_ID;
  const ghPrivateKey = (env as { GITHUB_APP_PRIVATE_KEY?: string }).GITHUB_APP_PRIVATE_KEY;
  const ownInstallationId = (env as { GITHUB_PLATFORM_INSTALLATION_ID?: string }).GITHUB_PLATFORM_INSTALLATION_ID;
  const repoOwner = (env as { GITHUB_PLATFORM_REPO_OWNER?: string }).GITHUB_PLATFORM_REPO_OWNER ?? SHIPPIE_REPO_OWNER;
  const repoName = (env as { GITHUB_PLATFORM_REPO_NAME?: string }).GITHUB_PLATFORM_REPO_NAME ?? SHIPPIE_REPO_NAME;
  if (!ghAppId || !ghPrivateKey || !ownInstallationId) {
    return json(
      {
        error: 'gh_dispatch_not_configured',
        reason:
          'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_PLATFORM_INSTALLATION_ID must all be set as wrangler secrets to dispatch builds.',
      },
      { status: 503 },
    );
  }

  // Mint a clone token for the maker's installation if available, embed
  // into a clone URL the workflow will use directly.
  let workflowRepoUrl = parsed.repo_url;
  if (parsed.installation_id != null) {
    try {
      const cloneToken = await getInstallationToken({
        appId: ghAppId,
        privateKey: ghPrivateKey,
        installationId: parsed.installation_id,
      });
      // Embed token: https://x-access-token:<token>@github.com/owner/repo.git
      const u = new URL(parsed.repo_url);
      u.username = 'x-access-token';
      u.password = cloneToken;
      workflowRepoUrl = u.toString();
    } catch (err) {
      console.warn('[deploy:github] clone-token mint failed; falling back to public clone', err);
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
  const callbackUrl = `${callbackBase}/api/v1/deploy/callback`;

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
        slug: parsed.slug,
        deploy_id: deployRow.id,
        version: String(version),
        callback_url: callbackUrl,
        branch: parsed.branch,
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

  return json({ deploy_id: deployRow.id, slug: parsed.slug, version, status: 'building' }, { status: 202 });
};
