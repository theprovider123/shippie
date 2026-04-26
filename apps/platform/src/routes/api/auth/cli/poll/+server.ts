/**
 * POST /api/auth/cli/poll
 *
 * RFC 8628 step 4. Body: { device_code }. Returns:
 *   { status: 'pending' }                         — keep polling
 *   { status: 'approved', access_token, ... }     — success (201/200)
 *   { status: 'expired' }                         — 410 (CLI exits)
 *   { status: 'already_consumed' }                — 409 (CLI exits)
 *   { status: 'not_found' }                       — 404 (CLI exits)
 *
 * Contract preserved from apps/web/app/api/auth/cli/poll/route.ts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeDeviceCode } from '$server/auth/cli-auth';

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) throw error(500, 'Database unavailable.');

  const body = (await request.json().catch(() => ({}))) as { device_code?: unknown };
  if (typeof body.device_code !== 'string' || body.device_code.length < 1) {
    return json({ error: 'device_code required' }, { status: 400 });
  }

  const outcome = await exchangeDeviceCode(body.device_code, platform.env.DB);
  switch (outcome.status) {
    case 'pending':
      return json({ status: 'pending' });
    case 'approved':
      return json({
        status: 'approved',
        access_token: outcome.accessToken,
        token_type: 'Bearer',
        user_id: outcome.userId,
      });
    case 'expired':
      return json({ status: 'expired' }, { status: 410 });
    case 'already_consumed':
      return json({ status: 'already_consumed' }, { status: 409 });
    case 'not_found':
      return json({ status: 'not_found' }, { status: 404 });
  }
};
