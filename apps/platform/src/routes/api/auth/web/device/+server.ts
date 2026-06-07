/**
 * POST /api/auth/web/device
 *
 * Creates a short-lived web-session transfer code for another signed-in
 * browser/PWA to approve. The receiver polls /api/auth/web/poll and gets a
 * normal Lucia session cookie after approval.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDeviceCode } from '$server/auth/cli-auth';
import { inferClientName, inferClientSurface } from '$server/auth/session-context';

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) throw error(500, 'Database unavailable.');

  const body = (await request.json().catch(() => ({}))) as {
    client_name?: unknown;
    client_surface?: unknown;
  };
  const clientName =
    typeof body.client_name === 'string'
      ? body.client_name.slice(0, 80)
      : inferClientName(request);
  const clientSurface =
    typeof body.client_surface === 'string' ? body.client_surface : inferClientSurface(request);

  const baseUrl = new URL(request.url).origin;
  const result = await createDeviceCode({
    clientName,
    scopes: ['web_session', clientSurface],
    baseUrl,
    db: platform.env.DB,
  });

  return json({
    device_code: result.deviceCode,
    user_code: result.userCode,
    verification_uri: `${baseUrl.replace(/\/$/, '')}/auth/continue`,
    expires_in: result.expiresIn,
    interval: result.interval,
  });
};
