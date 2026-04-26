/**
 * /__shippie/handoff — desktop→mobile handoff intent.
 *
 * Phase 6 status: persistence + email-send are still stubbed (handoff
 * email path goes through Resend; the platform-side sender lives in
 * apps/platform/src/lib/server/auth/email.ts and is wired separately).
 *
 * What we DO persist: an analytics_events row with event_name='handoff_request'
 * so the dashboard can see funnel data even before the email pipe is live.
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { eq } from 'drizzle-orm';

function isEmail(x: unknown): x is string {
  return typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

export async function handleHandoff(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const rl = checkRateLimit({
    key: `handoff:${ctx.slug}:${clientKey(ctx.request)}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await ctx.request.json().catch(() => ({}))) as {
    mode?: unknown;
    email?: unknown;
    handoff_url?: unknown;
  };

  if (body.mode !== 'email' && body.mode !== 'push') {
    return Response.json({ error: 'invalid_mode' }, { status: 400 });
  }
  if (body.mode === 'email' && !isEmail(body.email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (typeof body.handoff_url !== 'string') {
    return Response.json({ error: 'missing_handoff_url' }, { status: 400 });
  }

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (app) {
    try {
      await db.insert(schema.analyticsEvents).values({
        appId: app.id,
        userId: null,
        sessionId: null,
        eventName: 'handoff_request',
        properties: { mode: body.mode, has_email: body.mode === 'email' },
        url: null,
        referrer: null,
      });
    } catch (err) {
      console.error('[wrapper:handoff] event insert failed', { slug: ctx.slug, err });
    }
  }

  // Email send still deferred — the Resend client wiring on the Worker
  // path is a separate scope. Caller sees ok:true + a hint.
  return Response.json({ ok: true, mode: body.mode, queued: false });
}
