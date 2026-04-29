/**
 * GET /api/logs
 *
 * Authenticated maker logs for CLI/MCP clients. This intentionally returns
 * product-operational summaries, not raw user surveillance: no user ids,
 * session ids, external identity hints, IPs, or arbitrary metadata.
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import { authenticateBearer } from '$server/auth/cli-auth';

interface FeedbackRow {
  id: string;
  app_slug: string;
  app_name: string;
  type: string;
  status: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  vote_count: number;
  created_at: string;
}

interface UsageRow {
  app_slug: string;
  app_name: string;
  day: string;
  event_type: string;
  count: number;
}

interface FunctionLogRow {
  id: string;
  app_slug: string;
  app_name: string;
  function_name: string;
  method: string;
  status: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
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
  const slug = normalizeSlug(url.searchParams.get('slug'));
  const limit = clampLimit(Number(url.searchParams.get('limit') ?? '20'));

  const [feedback, usage, functions] = await Promise.all([
    fetchFeedback(platform.env.DB, auth.userId, slug, limit),
    fetchUsage(platform.env.DB, auth.userId, slug, limit),
    fetchFunctionLogs(platform.env.DB, auth.userId, slug, limit),
  ]);

  return json({
    scope: slug ? { slug } : { slug: null },
    feedback: feedback.map((row) => ({
      id: row.id,
      app_slug: row.app_slug,
      app_name: row.app_name,
      type: row.type,
      status: row.status,
      rating: row.rating,
      title: row.title,
      body: row.body,
      vote_count: row.vote_count,
      created_at: row.created_at,
    })),
    usage: usage.map((row) => ({
      app_slug: row.app_slug,
      app_name: row.app_name,
      day: row.day,
      event_type: row.event_type,
      count: row.count,
    })),
    functions: functions.map((row) => ({
      id: row.id,
      app_slug: row.app_slug,
      app_name: row.app_name,
      function_name: row.function_name,
      method: row.method,
      status: row.status,
      duration_ms: row.duration_ms,
      error: row.error,
      created_at: row.created_at,
    })),
  });
};

async function fetchFeedback(
  db: D1Database,
  userId: string,
  slug: string | null,
  limit: number,
): Promise<FeedbackRow[]> {
  const whereSlug = slug ? 'AND a.slug = ?' : '';
  const stmt = db.prepare(
    `SELECT f.id, a.slug AS app_slug, a.name AS app_name, f.type, f.status,
            f.rating, f.title, f.body, f.vote_count, f.created_at
     FROM feedback_items f
     INNER JOIN apps a ON a.id = f.app_id
     WHERE a.maker_id = ? ${whereSlug}
     ORDER BY f.created_at DESC
     LIMIT ?`,
  );
  const rows = slug
    ? await stmt.bind(userId, slug, limit).all<FeedbackRow>()
    : await stmt.bind(userId, limit).all<FeedbackRow>();
  return rows.results ?? [];
}

async function fetchUsage(
  db: D1Database,
  userId: string,
  slug: string | null,
  limit: number,
): Promise<UsageRow[]> {
  const whereSlug = slug ? 'AND a.slug = ?' : '';
  const stmt = db.prepare(
    `SELECT a.slug AS app_slug, a.name AS app_name, u.day, u.event_type, u.count
     FROM usage_daily u
     INNER JOIN apps a ON a.id = u.app_id
     WHERE a.maker_id = ? ${whereSlug}
     ORDER BY u.day DESC, u.count DESC
     LIMIT ?`,
  );
  const rows = slug
    ? await stmt.bind(userId, slug, limit).all<UsageRow>()
    : await stmt.bind(userId, limit).all<UsageRow>();
  return rows.results ?? [];
}

async function fetchFunctionLogs(
  db: D1Database,
  userId: string,
  slug: string | null,
  limit: number,
): Promise<FunctionLogRow[]> {
  const whereSlug = slug ? 'AND a.slug = ?' : '';
  const stmt = db.prepare(
    `SELECT l.id, a.slug AS app_slug, a.name AS app_name, l.function_name,
            l.method, l.status, l.duration_ms, l.error, l.created_at
     FROM function_logs l
     INNER JOIN apps a ON a.id = l.app_id
     WHERE a.maker_id = ? ${whereSlug}
     ORDER BY l.created_at DESC
     LIMIT ?`,
  );
  const rows = slug
    ? await stmt.bind(userId, slug, limit).all<FunctionLogRow>()
    : await stmt.bind(userId, limit).all<FunctionLogRow>();
  return rows.results ?? [];
}

function normalizeSlug(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed) ? trimmed : null;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(100, Math.floor(value)));
}
