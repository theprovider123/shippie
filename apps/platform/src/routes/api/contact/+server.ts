/**
 * Platform-level contact / help form.
 *
 * No app slug required — routes to hello@shippie.app and, if available,
 * persists a note via KV for the admin inbox. This is separate from
 * /__shippie/feedback which is app-scoped (requires app_id FK).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRateLimit, clientKey } from '$lib/server/wrapper/rate-limit';

const ALLOWED_TYPES = new Set(['bug', 'idea', 'help', 'other']);
const MAX_LEN = 4000;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const ip = clientKey(request);
  const rl = checkRateLimit({ key: `contact:${ip}`, limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 });

  const { type, message } = body as Record<string, unknown>;
  if (!type || typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
    return json({ error: 'invalid_type' }, { status: 400 });
  }
  const text = typeof message === 'string' ? message.trim().slice(0, MAX_LEN) : '';
  if (!text) return json({ error: 'message_required' }, { status: 400 });

  const userId = locals.user?.id ?? null;
  const userEmail = locals.user?.email ?? 'anonymous';
  const env = platform?.env;

  if (env?.EMAIL) {
    const from = env.AUTH_EMAIL_FROM?.trim() || 'shippie <noreply@shippie.app>';
    try {
      await env.EMAIL.send({
        to: 'hello@shippie.app',
        from,
        subject: `[Shippie] Contact: ${type}`,
        text: `From: ${userEmail}\nType: ${type}\n\n${text}`,
        html: `<p><strong>From:</strong> ${userEmail} (user id: ${userId ?? 'anon'})</p><p><strong>Type:</strong> ${type}</p><p>${text.replace(/\n/g, '<br>')}</p>`,
      });
    } catch (err) {
      console.error('[api/contact] email failed', err);
      // Don't surface email errors to users — still acknowledge the submit.
    }
  } else {
    // Dev fallback
    console.log('[api/contact] contact form submit', { type, userEmail, text: text.slice(0, 120) });
  }

  return json({ ok: true });
};
