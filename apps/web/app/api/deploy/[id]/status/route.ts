/**
 * GET /api/deploy/[id]/status
 *
 * Poll endpoint for deploy progress. The hot path returns a live URL
 * immediately; cold work (ranking recompute, auto-packaging) happens
 * asynchronously. This endpoint surfaces progress so the CLI / MCP /
 * dashboard can render a "finishing up…" indicator after the URL arrives.
 *
 * Response states:
 *   - building       — hot path in flight; live_url not ready yet
 *   - ready          — hot path done; cold work not started (rare transient)
 *   - cold-pending   — hot path done; cold work in flight
 *   - done           — cold work complete
 *   - failed         — hot path failed
 *
 * Differentiation plan Pillar C1.
 */
import { sql } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeployStatusRow {
  id: string;
  slug: string;
  version: number;
  sourceType: string;
  status: string;
  autopackagingStatus: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

type Ctx = { params: Promise<{ id: string }> };

export const GET = withLogger<Ctx>('deploy.status', async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;

  const db = await getDb();
  const rows = (await db.execute(sql`
    select d.id,
           a.slug,
           d.version,
           d.source_type as "sourceType",
           d.status,
           d.autopackaging_status as "autopackagingStatus",
           d.duration_ms as "durationMs",
           d.created_at as "createdAt",
           d.completed_at as "completedAt"
    from deploys d
    join apps a on a.id = d.app_id
    where d.id = ${id}
    limit 1
  `)) as unknown as DeployStatusRow[];

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const phase = derivePhase(row);

  return NextResponse.json({
    deploy_id: row.id,
    slug: row.slug,
    version: row.version,
    source_type: row.sourceType,
    phase,
    status: row.status,
    autopackaging_status: row.autopackagingStatus,
    duration_ms: row.durationMs,
    created_at: row.createdAt,
    completed_at: row.completedAt,
  });
});

function derivePhase(row: DeployStatusRow): 'building' | 'ready' | 'cold-pending' | 'done' | 'failed' {
  if (row.status === 'failed') return 'failed';
  if (row.status === 'building') return 'building';
  // status === 'success' — inspect cold state
  switch (row.autopackagingStatus) {
    case null:
      return 'ready';
    case 'pending':
      return 'cold-pending';
    case 'partial':
    case 'complete':
      return 'done';
    default:
      return 'ready';
  }
}
