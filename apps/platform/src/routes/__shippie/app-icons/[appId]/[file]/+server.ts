/**
 * GET /__shippie/app-icons/:appId/:file
 *
 * Serves maker app icons ingested into R2 (see lib/server/icons/ingest.ts)
 * from the same origin — no third-party hotlinks. Stored under the APPS bucket
 * at `app-icons/{appId}/{file}`.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ingestedIconKey } from '$server/icons/ingest';

const ALLOWED_FILE = /^icon\.(png|webp|jpg)$/;

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env.APPS) throw error(503, 'storage unavailable');
  const { appId, file } = params;
  if (!appId || !ALLOWED_FILE.test(file ?? '')) throw error(404, 'Not found');

  const ext = (file as string).split('.').pop() as string;
  const object = await platform.env.APPS.get(ingestedIconKey(appId, ext));
  if (!object) throw error(404, 'Not found');

  const bytes = new Uint8Array(await object.arrayBuffer());
  return new Response(bytes, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
