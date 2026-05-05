import type { RequestHandler } from './$types';
import { containerSlugForRequest } from '$lib/showcase-slugs';
import { handleYourData } from '$server/wrapper/router/your-data';

export const GET: RequestHandler = async ({ request, url, platform }) => {
  const slug = inferSlug(request, url);
  return handleYourData({
    request,
    env: platform?.env as never,
    slug,
    traceId: crypto.randomUUID(),
  });
};

function inferSlug(request: Request, url: URL): string {
  const explicit = url.searchParams.get('slug') ?? url.searchParams.get('app');
  if (explicit && /^[a-z0-9-]{1,63}$/.test(explicit)) return explicit;

  const referrer = request.headers.get('referer');
  if (referrer) {
    try {
      const refUrl = new URL(referrer);
      const runMatch = /^\/run\/([^/]+)/.exec(refUrl.pathname);
      if (runMatch) return containerSlugForRequest(decodeURIComponent(runMatch[1]!));
      const app = refUrl.searchParams.get('app');
      if (app && /^[a-z0-9-]{1,63}$/.test(app)) return app;
    } catch {
      // Bad referrer headers are ignored; the page still renders.
    }
  }

  return 'shippie';
}
