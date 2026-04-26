/**
 * POST /api/auth/cli/approve
 *
 * Bind a user_code to the currently signed-in user. Auth via Lucia session
 * cookie — the activation page lives at /auth/cli/activate and POSTs here.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveDeviceCode } from '$server/auth/cli-auth';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  if (!platform?.env.DB) throw error(500, 'Database unavailable.');
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { user_code?: unknown };
  if (typeof body.user_code !== 'string' || body.user_code.length < 1) {
    return json({ error: 'user_code required' }, { status: 400 });
  }

  const result = await approveDeviceCode({
    userCode: body.user_code.trim().toUpperCase(),
    userId: locals.user.id,
    db: platform.env.DB,
  });

  if (!result.ok) {
    return json({ error: result.reason }, { status: 400 });
  }

  return json({ ok: true, client_name: result.clientName });
};
