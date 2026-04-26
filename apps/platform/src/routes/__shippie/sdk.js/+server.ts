import type { RequestHandler } from './$types';
import { handleSdk } from '$server/wrapper/router/sdk';

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  return handleSdk({
    request,
    env: platform.env,
    slug: '_platform_',
    traceId: crypto.randomUUID()
  });
};
