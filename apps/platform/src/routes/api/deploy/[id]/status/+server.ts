/**
 * GET /api/deploy/[id]/status
 *
 * Polled by the CLI / dashboard to render deploy progress. Phase 4b
 * skips the cold-pack stage entirely, so phase only switches between
 * `building`, `ready`, `failed`, and `done` (all post-hot rows are `done`).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface Row {
  id: string;
  slug: string;
  version: number;
  source_type: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env.DB) throw error(500, 'database unavailable');

  const row = await platform.env.DB
    .prepare(
      `SELECT d.id, a.slug, d.version, d.source_type, d.status, d.duration_ms, d.created_at, d.completed_at
       FROM deploys d
       JOIN apps a ON a.id = d.app_id
       WHERE d.id = ?
       LIMIT 1`,
    )
    .bind(params.id)
    .first<Row>();

  if (!row) return json({ error: 'not_found' }, { status: 404 });

  const phase =
    row.status === 'failed' ? 'failed' : row.status === 'building' ? 'building' : 'done';

  return json({
    deploy_id: row.id,
    slug: row.slug,
    version: row.version,
    source_type: row.source_type,
    phase,
    status: row.status,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
    completed_at: row.completed_at,
  });
};
