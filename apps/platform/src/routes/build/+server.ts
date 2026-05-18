import type { RequestHandler } from './$types';
import { redirectRetiredRoute } from '$lib/server/launch-redirects';

export const GET: RequestHandler = ({ url }) => {
  redirectRetiredRoute(url, '/build');
  return new Response(null, { status: 301, headers: { location: '/docs/build' } });
};
