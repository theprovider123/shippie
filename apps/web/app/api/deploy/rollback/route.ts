/**
 * POST /api/deploy/rollback
 *
 * Point an app at a prior successful deploy. Caller must be the maker
 * of the slug. CSP isn't re-written (see lib/deploy/rollback.ts) —
 * response carries `csp_stale: true` so callers can prompt a redeploy.
 *
 * Body:
 *   { slug, to_version: number }     // explicit target version
 *   { slug, to: "previous" }         // last successful deploy before current active
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveUserId } from '@/lib/cli-auth';
import { rollbackApp } from '@/lib/deploy/rollback';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RollbackSchema = z.union([
  z.object({
    slug: z.string().min(1),
    to_version: z.number().int().positive(),
    to: z.never().optional(),
  }),
  z.object({
    slug: z.string().min(1),
    to: z.literal('previous'),
    to_version: z.never().optional(),
  }),
]);

export const POST = withLogger('deploy.rollback', async (req: NextRequest) => {
  const who = await resolveUserId(req);
  if (!who) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = checkRateLimit({
    key: `rollback:${who.userId}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBody(req, RollbackSchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const result =
    'to_version' in body && body.to_version != null
      ? await rollbackApp({
          slug: body.slug,
          actorUserId: who.userId,
          targetVersion: body.to_version,
        })
      : await rollbackApp({
          slug: body.slug,
          actorUserId: who.userId,
          to: 'previous',
        });

  if (!result.success) {
    const status =
      result.reason === 'app_not_found' || result.reason === 'version_not_found'
        ? 404
        : result.reason === 'forbidden'
          ? 403
          : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json(result);
});
