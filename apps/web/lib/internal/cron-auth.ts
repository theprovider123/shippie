/**
 * Auth check for internal cron endpoints.
 *
 * Accepts either:
 *   - `SHIPPIE_INTERNAL_CRON_TOKEN` (self-host / curl), or
 *   - `CRON_SECRET` (Vercel Cron's automatic header).
 *
 * Both secrets are checked in constant-ish time via `===` against
 * separate env vars. Set whichever your scheduler uses. Vercel's
 * managed cron only sends GET requests with the CRON_SECRET bearer;
 * the POST path stays open so CI/self-host can trigger on demand.
 *
 * Fails closed when neither env var is configured.
 */
import type { NextRequest } from 'next/server';

export function authorizeCron(req: NextRequest): boolean {
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided) return false;

  const shippieToken = process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  const vercelToken = process.env.CRON_SECRET;

  if (shippieToken && provided === shippieToken) return true;
  if (vercelToken && provided === vercelToken) return true;
  return false;
}
