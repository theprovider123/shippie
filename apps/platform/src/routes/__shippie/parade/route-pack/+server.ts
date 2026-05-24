import type { RequestHandler } from './$types';
import { readLiveRoutePack } from '$server/parade/route-pack-live';

export const GET: RequestHandler = async ({ platform }) => {
  const body = await readLiveRoutePack(platform?.env.CACHE);
  if (!body) {
    return new Response(JSON.stringify({ error: 'no_live_route_pack' }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*',
    },
  });
};
