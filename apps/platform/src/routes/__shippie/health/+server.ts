/**
 * Internal binding probe — moved here from the homepage in Phase 4a so the
 * marketplace homepage isn't cluttered with debug output. Hit this URL to
 * confirm every Cloudflare binding (D1, R2 ×2, KV) resolves and the auth
 * factory instantiates.
 *
 * Returns JSON `{ status: 'ok' | 'degraded', bindings: {...} }`. Status is
 * 'degraded' if any probe errored; the response code is still 200 so an
 * uptime probe sees the JSON and can alert on the inner status field.
 *
 * Not auth-gated — bindings are sandboxed; the probe never reads a real
 * key (`head` of a key that doesn't exist; `get` of a placeholder).
 */
import type { RequestHandler } from './$types';
import { createLucia } from '$server/auth/lucia';

export const GET: RequestHandler = async ({ platform }) => {
  if (!platform) {
    return Response.json({ status: 'no-platform', bindings: {} }, { status: 200 });
  }

  const env = platform.env;
  const bindings: Record<string, string> = {
    DB: 'unknown',
    APPS: 'unknown',
    ASSETS: 'unknown',
    CACHE: 'unknown',
    SIGNAL_ROOM: env.SIGNAL_ROOM ? 'bound' : 'phase-6',
    auth: 'unknown',
    SHIPPIE_ENV: env.SHIPPIE_ENV ?? 'unset',
    PUBLIC_ORIGIN: env.PUBLIC_ORIGIN ?? 'unset',
  };

  try {
    const r = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    bindings.DB = r?.ok === 1 ? 'ok' : 'unexpected';
  } catch (err) {
    bindings.DB = `error: ${(err as Error).message}`;
  }

  try {
    await env.APPS.head('___healthcheck-key-that-doesnt-exist___');
    bindings.APPS = 'ok';
  } catch (err) {
    bindings.APPS = `error: ${(err as Error).message}`;
  }

  try {
    await env.PLATFORM_ASSETS.head('___healthcheck-key-that-doesnt-exist___');
    bindings.ASSETS = 'ok';
  } catch (err) {
    bindings.ASSETS = `error: ${(err as Error).message}`;
  }

  try {
    const probe = await env.CACHE.get('___healthcheck-probe___');
    bindings.CACHE = probe === null ? 'ok' : 'unexpected';
  } catch (err) {
    bindings.CACHE = `error: ${(err as Error).message}`;
  }

  try {
    const lucia = createLucia(env.DB, env);
    bindings.auth = lucia.sessionCookieName === 'shippie_session' ? 'ok' : 'unexpected';
  } catch (err) {
    bindings.auth = `error: ${(err as Error).message}`;
  }

  const degraded = Object.entries(bindings).some(([k, v]) =>
    typeof v === 'string' && v.startsWith('error:') && k !== 'SIGNAL_ROOM',
  );

  return Response.json({ status: degraded ? 'degraded' : 'ok', bindings });
};
