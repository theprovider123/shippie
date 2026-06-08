/**
 * POST /api/auth/web/poll
 *
 * Polls a web-session transfer code. On approval, creates a normal Lucia
 * session cookie in the polling browser/PWA.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLucia } from '$server/auth/lucia';
import { exchangeDeviceCodeForWebSession } from '$server/auth/cli-auth';
import { annotateSessionContext } from '$server/auth/session-context';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
  if (!platform?.env.DB) throw error(500, 'Database unavailable.');

  const body = (await request.json().catch(() => ({}))) as {
    device_code?: unknown;
    client_id?: unknown;
    client_name?: unknown;
    client_surface?: unknown;
  };
  if (typeof body.device_code !== 'string' || body.device_code.length < 1) {
    return json({ error: 'device_code required' }, { status: 400 });
  }

  const outcome = await exchangeDeviceCodeForWebSession(body.device_code, platform.env.DB);
  switch (outcome.status) {
    case 'pending':
      return json({ status: 'pending' });
    case 'expired':
      return json({ status: 'expired' }, { status: 410 });
    case 'already_consumed':
      return json({ status: 'already_consumed' }, { status: 409 });
    case 'not_found':
      return json({ status: 'not_found' }, { status: 404 });
    case 'wrong_scope':
      return json({ status: 'wrong_scope' }, { status: 400 });
    case 'approved': {
      const lucia = createLucia(platform.env.DB, platform.env);
      const session = await lucia.createSession(outcome.userId, {});
      const cookie = lucia.createSessionCookie(session.id);
      cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });
      await annotateSessionContext({
        db: platform.env.DB,
        sessionId: session.id,
        request,
        clientId: typeof body.client_id === 'string' ? body.client_id : null,
        clientName: typeof body.client_name === 'string' ? body.client_name : outcome.clientName,
        clientSurface: typeof body.client_surface === 'string' ? body.client_surface : null,
      });
      return json({ status: 'approved' });
    }
  }
};
