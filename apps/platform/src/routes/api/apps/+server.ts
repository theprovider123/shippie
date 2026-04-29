/**
 * GET /api/apps
 *
 * Authenticated maker app list for CLI/MCP clients. This is deliberately
 * small and stable: enough to answer "what have I shipped?" without
 * coupling the toolchain to dashboard-only shapes.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateBearer } from '$server/auth/cli-auth';

interface MakerAppRow {
  slug: string;
  name: string;
  latest_deploy_status: string | null;
  current_detected_kind: string | null;
  visibility_scope: string;
  is_archived: number | boolean;
  last_deployed_at: string | null;
  updated_at: string;
}

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) {
    return json({ error: 'database_unavailable' }, { status: 500 });
  }

  const auth = await authenticateBearer(
    request.headers.get('authorization'),
    platform.env.DB,
  );
  if (!auth) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clampLimit(Number(url.searchParams.get('limit') ?? '50'));
  const rows = await platform.env.DB
    .prepare(
      `SELECT slug, name, latest_deploy_status, current_detected_kind,
              visibility_scope, is_archived, last_deployed_at, updated_at
       FROM apps
       WHERE maker_id = ?
       ORDER BY COALESCE(last_deployed_at, updated_at) DESC
       LIMIT ?`,
    )
    .bind(auth.userId, limit)
    .all<MakerAppRow>();

  const apps = (rows.results ?? []).map((app) => ({
    slug: app.slug,
    name: app.name,
    status: app.is_archived ? 'archived' : (app.latest_deploy_status ?? 'draft'),
    kind: app.current_detected_kind ?? null,
    visibility: app.visibility_scope,
    live_url: `https://${app.slug}.shippie.app/`,
    updated_at: app.last_deployed_at ?? app.updated_at,
  }));

  return json({ apps });
};

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.floor(value)));
}
