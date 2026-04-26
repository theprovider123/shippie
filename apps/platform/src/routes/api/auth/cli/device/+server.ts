/**
 * POST /api/auth/cli/device
 *
 * RFC 8628 step 1. Returns { device_code, user_code, verification_uri,
 * verification_uri_complete, expires_in, interval }. Unauthenticated.
 *
 * Contract preserved from apps/web/app/api/auth/cli/device/route.ts so the
 * existing `shippie login` CLI keeps working without a re-release.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDeviceCode } from '$server/auth/cli-auth';

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) throw error(500, 'Database unavailable.');

  let clientName = 'shippie-cli';
  let scopes: string[] = [];
  try {
    const body = (await request.json().catch(() => ({}))) as {
      client_name?: unknown;
      scopes?: unknown;
    };
    if (typeof body.client_name === 'string') clientName = body.client_name.slice(0, 64);
    if (Array.isArray(body.scopes)) {
      scopes = body.scopes.filter((s): s is string => typeof s === 'string').slice(0, 16);
    }
  } catch {
    // Empty body is allowed.
  }

  const baseUrl = platform.env.PUBLIC_ORIGIN ?? 'https://shippie.app';
  const result = await createDeviceCode({
    clientName,
    scopes,
    baseUrl,
    db: platform.env.DB,
  });

  return json({
    device_code: result.deviceCode,
    user_code: result.userCode,
    verification_uri: result.verificationUri,
    verification_uri_complete: result.verificationUriComplete,
    expires_in: result.expiresIn,
    interval: result.interval,
  });
};
