import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { checkRateLimit, clientKey } from '$server/wrapper/rate-limit';
import { moderateFeedback } from '$server/moderation/feedback';
import { normalizeReportInput } from '$lib/reports/reasons';

/**
 * POST /api/apps/[slug]/report — anybody (signed-in OR anonymous) can flag
 * an app for admin review. Abuse reports must never require login, so this
 * is deliberately open; IP rate-limited to blunt spam. Reports always land
 * as status 'open' for an admin to triage at /admin/reports — moderation
 * heuristics only annotate (moderationFlags), they never auto-hide.
 */
export const POST: RequestHandler = async ({ request, params, platform, locals }) => {
  if (!platform?.env?.DB) return new Response('No platform', { status: 503 });
  const slug = params.slug;

  const rl = checkRateLimit({
    key: `report:${clientKey(request)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let raw: { reason?: unknown; detail?: unknown };
  try {
    raw = (await request.json()) as { reason?: unknown; detail?: unknown };
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const normalized = normalizeReportInput(raw);
  if (!normalized) return Response.json({ error: 'invalid_reason' }, { status: 400 });

  const db = getDrizzleClient(platform.env.DB);
  const [app] = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return Response.json({ error: 'not_found' }, { status: 404 });

  const moderation = moderateFeedback({
    type: 'report',
    title: null,
    body: normalized.detail,
    rating: null,
  });

  const [row] = await db
    .insert(schema.appReports)
    .values({
      appId: app.id,
      slug,
      reporterUserId: locals.user?.id ?? null,
      reason: normalized.reason,
      detail: normalized.detail,
      status: 'open',
      moderationFlags: moderation.flags.length ? moderation.flags : null,
    })
    .returning({ id: schema.appReports.id });

  return Response.json({ ok: true, id: row?.id });
};
