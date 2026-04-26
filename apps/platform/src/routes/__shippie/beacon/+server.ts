import type { RequestHandler } from './$types';
import { handleBeacon } from '$server/wrapper/router/beacon';

export const POST: RequestHandler = async ({ request, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleBeacon({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};
