/**
 * Short invite URL redirector. Looks up `i:{code}` in KV and 302s to the
 * long-form `/invite/{token}` claim page. 404s on miss/expired.
 *
 * Port of `apps/web/app/i/[code]/route.ts`. The KV key pattern is the
 * same — both apps will read the same namespace until cutover, after
 * which the new platform owns it.
 */
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CODE_RE = /^[a-z0-9]{4,16}$/;
const KV_PREFIX = 'i:';

export const GET: RequestHandler = async ({ platform, params, url }) => {
  if (!platform?.env.CACHE) throw error(503, 'Storage unavailable');
  const { code } = params;
  if (!code || !CODE_RE.test(code)) throw error(404, 'Not found');

  const token = await platform.env.CACHE.get(`${KV_PREFIX}${code}`);
  if (!token) throw error(404, 'Not found');

  const dest = new URL(`/invite/${token}`, url.origin);
  throw redirect(302, dest.toString());
};
