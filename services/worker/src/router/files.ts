/**
 * Maker files router.
 *
 * Catch-all that serves the app's built files from R2 at
 * `apps/{slug}/v{active}/<path>`. If the path is `/` we serve `index.html`;
 * if the requested path isn't found we fall back to `index.html` for SPA
 * client-side routing.
 *
 * Spec v6 §10 (deploy pipeline), §9.3 (SW strategy).
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

export const filesRouter = new Hono<AppBindings>();

filesRouter.all('*', async (c) => {
  const slug = c.var.slug;
  const active = await c.env.APP_CONFIG.get(`apps:${slug}:active`);

  if (!active) {
    return new Response(unpublishedHtml(slug), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const url = new URL(c.req.url);
  let path = url.pathname;

  // Normalize leading /
  if (path === '/') path = '/index.html';
  if (!path.startsWith('/')) path = '/' + path;

  const r2Key = `apps/${slug}/v${active}${path}`;
  let obj = await c.env.SHIPPIE_APPS.get(r2Key);

  // SPA fallback: if the exact file is not found and the request looks
  // like a document navigation (no extension, or .html), try index.html.
  if (!obj) {
    const isNavigation =
      !path.includes('.') ||
      path.endsWith('.html') ||
      c.req.header('sec-fetch-mode') === 'navigate';
    if (isNavigation) {
      obj = await c.env.SHIPPIE_APPS.get(`apps/${slug}/v${active}/index.html`);
    }
  }

  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const body = toResponseBody(await obj.body());
  const contentType =
    obj.httpMetadata?.contentType ?? 'application/octet-stream';

  const isHtml = contentType.startsWith('text/html');
  const cacheControl = isHtml
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Shippie-Version': String(active),
    },
  });
});

function unpublishedHtml(slug: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>${slug}.shippie.app — not yet published</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #fafafa; min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 2rem; }
  .card { max-width: 32rem; text-align: center; }
  .tag { font: 12px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.1em; color: #f97316; margin-bottom: 1rem; }
  h1 { font-size: 2rem; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; opacity: 0.7; }
  a { color: #f97316; text-decoration: none; }
</style>
<div class="card">
  <p class="tag">shippie.app</p>
  <h1>${slug} hasn't shipped yet</h1>
  <p>This subdomain is reserved but no version has been published.
     The maker needs to finish their deploy at shippie.app/new.</p>
  <p><a href="https://shippie.app">Browse live apps →</a></p>
</div>`;
}
