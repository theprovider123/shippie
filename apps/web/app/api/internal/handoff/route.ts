// apps/web/app/api/internal/handoff/route.ts
/**
 * Platform-side handoff dispatcher — called by the worker's
 * /__shippie/handoff route after signing.
 *
 * Email path: POSTs to Resend with renderHandoffEmail output.
 * Push path: looks up wrapper_push_subscriptions by app_id and
 *   dispatches Web Push to each (via push-dispatch helper; in Phase
 *   2 we stub when no subscriptions exist and just return sent=0).
 */
import { type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { renderHandoffEmail } from '@/lib/shippie/handoff';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HandoffBody {
  slug?: unknown;
  mode?: unknown;
  email?: unknown;
  handoff_url?: unknown;
}

function isEmail(x: unknown): x is string {
  return typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Dev: log + pretend success.
    console.log(
      JSON.stringify({
        level: 'info',
        route: 'shippie.handoff',
        action: 'email_simulated',
        to,
        subject,
      }),
    );
    return true;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Shippie <no-reply@shippie.app>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  return res.ok;
}

export const POST = withLogger('shippie.internal.handoff', async (req: NextRequest) => {
  const raw = await req.text();
  try {
    await verifyInternalRequest(req, raw);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'unauthorized', message: (err as Error).message }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: HandoffBody = {};
  try {
    body = JSON.parse(raw) as HandoffBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const slug = typeof body.slug === 'string' ? body.slug : null;
  const mode = body.mode;
  const handoffUrl = typeof body.handoff_url === 'string' ? body.handoff_url : null;
  if (!slug) {
    return new Response(JSON.stringify({ error: 'missing_slug' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (mode !== 'email' && mode !== 'push') {
    return new Response(JSON.stringify({ error: 'invalid_mode' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!handoffUrl) {
    return new Response(JSON.stringify({ error: 'missing_handoff_url' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (mode === 'email') {
    if (!isEmail(body.email)) {
      return new Response(JSON.stringify({ error: 'invalid_email' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const rendered = renderHandoffEmail({ appName: slug, handoffUrl });
    const ok = await sendEmailViaResend(body.email, rendered.subject, rendered.html, rendered.text);
    return new Response(JSON.stringify({ ok }), {
      status: ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  // mode === 'push'
  const db = await getDb();
  const subs = await db
    .select()
    .from(schema.wrapperPushSubscriptions)
    .where(eq(schema.wrapperPushSubscriptions.appId, slug));
  if (subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Phase 3 wires push-dispatch. For now, stub.
  return new Response(
    JSON.stringify({ ok: true, sent: 0, note: 'push_dispatch_not_implemented' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
