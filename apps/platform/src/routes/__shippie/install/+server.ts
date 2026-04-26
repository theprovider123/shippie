import type { RequestHandler } from './$types';
import { handleInstall } from '$server/wrapper/router/install';

export const GET: RequestHandler = handle;
export const POST: RequestHandler = handle;

async function handle({ request, url, platform }: Parameters<RequestHandler>[0]) {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleInstall({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
}
