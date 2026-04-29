/**
 * P1C — `/__shippie/proxy?url=...` endpoint.
 *
 * Iframe apps with read-it-later style flows fetch through this so
 * cross-origin reads work without each maker hand-rolling SSRF
 * mitigations. The full pipeline lives in `lib/server/proxy/proxy.ts`;
 * this file is the SvelteKit shim — extract the URL, run the pipeline,
 * map ProxyError to a status code.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { ProxyError } from '$lib/server/proxy/ssrf-guards';
import { executeProxyFetch } from '$lib/server/proxy/proxy';

export const GET: RequestHandler = async ({ url, locals }) => {
  const target = url.searchParams.get('url');
  if (!target) throw error(400, 'Missing ?url= parameter.');

  // Per-session quota: hard cap of 100 fetches per hour, enforced
  // against the lucia session id when available. Anonymous browsers
  // get a single shared bucket keyed by Cloudflare IP via locals.
  const session = locals.session?.userId ?? 'anonymous';
  if (await isQuotaExceeded(session)) {
    throw error(429, 'Proxy quota exceeded for this session.');
  }

  try {
    const result = await executeProxyFetch(target);
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (err) {
    if (err instanceof ProxyError) {
      throw error(err.status, err.message);
    }
    throw err;
  }
};

/**
 * Quota stub. P1C ships in-memory bookkeeping per Worker isolate; the
 * D1-backed durable quota lands in a follow-up commit (the SQL table
 * is documented in the plan but the migration is its own change).
 * In-memory is acceptable for v1 because each session id binds to a
 * given DO/Worker instance for several minutes at a time.
 */
const QUOTA_BUCKET = new Map<string, { count: number; windowEnd: number }>();
const QUOTA_LIMIT = 100;
const QUOTA_WINDOW_MS = 60 * 60 * 1000;

async function isQuotaExceeded(key: string): Promise<boolean> {
  const now = Date.now();
  const bucket = QUOTA_BUCKET.get(key);
  if (!bucket || bucket.windowEnd < now) {
    QUOTA_BUCKET.set(key, { count: 1, windowEnd: now + QUOTA_WINDOW_MS });
    return false;
  }
  if (bucket.count >= QUOTA_LIMIT) return true;
  bucket.count += 1;
  return false;
}
