import type { RequestHandler } from './$types';
import { readLiveRoutePack } from '$server/parade/route-pack-live';

export const GET: RequestHandler = async ({ platform }) => {
  const body = await readLiveRoutePack(platform?.env.CACHE);
  if (!body) {
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
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
