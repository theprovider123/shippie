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
 *   2. Resolve the maker's GitHub App installation:
 *      - explicit installation_id (verify ownership), OR
 *      - the user's single installation if exactly one exists, OR
 *      - none (public-repo only).
 *      Fail fast on suspended installs (409).
 *   3. Insert a deploys row with status='building', source_type='github'.
 *   4. POST workflow_dispatch to .github/workflows/shippie-build.yml,
 *      passing installation_id as a workflow input. The workflow itself
 *      mints the short-lived clone token via actions/create-github-app-token
 *      using the GH_APP_ID + GH_APP_PRIVATE_KEY repo secrets.
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
import type { GithubInstallation } from '$server/db/schema/github-installations';

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

  // 1. Resolve the maker's GitHub App installation.
  //
  //    - If the caller supplied installation_id explicitly, verify they own
  //      it.
  //    - Otherwise, fall back to the single installation owned by this user
  //      (typical case: maker installed the Shippie GH App once on their
  //      personal account).
  //    - In either case, fail fast if the installation has been suspended
  //      or revoked — better an explicit error here than an opaque 401 in
  //      the GH Actions runner mid-build.
  let resolvedInstall: GithubInstallation | null = null;
  if (parsed.installation_id != null) {
    const install = await db.query.githubInstallations.findFirst({
      where: eq(schema.githubInstallations.githubInstallationId, parsed.installation_id),
    });
    if (!install || install.userId !== who.userId) {
      return json({ error: 'installation_forbidden' }, { status: 403 });
    }
    resolvedInstall = install;
  } else {
    // No explicit ID — try to find one for this user. Multiple is
    // ambiguous; the client must disambiguate via repo_full_name in a
    // future iteration. For now we accept "user has exactly one".
    const userInstalls = await db.query.githubInstallations.findMany({
      where: eq(schema.githubInstallations.userId, who.userId),
    });
    if (userInstalls.length === 1) {
      resolvedInstall = userInstalls[0] ?? null;
    } else if (userInstalls.length > 1) {
      // Caller must pass installation_id when there are multiple choices.
      return json(
        { error: 'installation_ambiguous', count: userInstalls.length },
        { status: 400 },
      );
    }
    // 0 installations is fine — public-repo deploy path.
  }

  if (resolvedInstall && resolvedInstall.suspendedAt) {
    return json(
      {
        error: 'installation_suspended',
        installation_id: resolvedInstall.githubInstallationId,
        suspended_at: resolvedInstall.suspendedAt,
      },
      { status: 409 },
    );
  }

  const installationIdForBuild = resolvedInstall?.githubInstallationId ?? null;

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
        githubInstallationId: installationIdForBuild,
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
        githubInstallationId: installationIdForBuild ?? app.githubInstallationId,
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
  //    the platform repo. The maker's installation token is NO LONGER
  //    minted here — the workflow itself uses
  //    actions/create-github-app-token@v2 with GH_APP_ID + GH_APP_PRIVATE_KEY
  //    repo secrets and the `installation_id` workflow input. This avoids
  //    embedding a short-lived token in a string parameter that's logged
  //    on the GH Actions side.
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

  // Pass repo_url with no embedded credentials — the workflow re-parses it
  // and clones with a freshly minted installation token.
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
        repo_url: parsed.repo_url,
        slug: parsed.slug,
        deploy_id: deployRow.id,
        version: String(version),
        callback_url: callbackUrl,
        branch: parsed.branch,
        // workflow_dispatch inputs must be strings; empty string means
        // "no installation, public repo".
        installation_id: installationIdForBuild != null ? String(installationIdForBuild) : '',
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
