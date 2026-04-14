/**
 * /health — control plane health endpoint.
 *
 * Used by uptime monitoring and Vercel readiness probes. Returns 200 + JSON
 * once the app is up. Database health is checked separately at /api/internal/health
 * since this endpoint must respond even when the DB is unreachable.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return Response.json({
    ok: true,
    service: 'shippie-web',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    region: process.env.VERCEL_REGION ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
