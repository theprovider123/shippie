/**
 * Maker files router. Ported from services/worker/src/router/files.ts.
 *
 * Catch-all that serves the app's built files from R2 at
 * `apps/{slug}/v{active}/<path>`. SPA fallback to index.html.
 *
 * Building flag (apps:{slug}:building) → "shipping…" auto-refresh page.
 * Missing active pointer → "not yet published" 404.
 */
import type { WrapperContext } from '../env';
import { toResponseBody } from '../bytes';

interface BuildingFlag {
  commit_sha?: string | null;
  started_at?: number;
  source?: string;
}

export async function serveFromR2(ctx: WrapperContext): Promise<Response> {
  const slug = ctx.slug;
  const active = await ctx.env.CACHE.get(`apps:${slug}:active`);

  if (!active) {
    const buildingRaw = await ctx.env.CACHE.get(`apps:${slug}:building`);
    if (buildingRaw) {
      let flag: BuildingFlag = {};
      try {
        flag = JSON.parse(buildingRaw) as BuildingFlag;
      } catch {
        flag = {};
      }
      return new Response(buildingHtml(slug, flag), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Shippie-Status': 'building',
          Refresh: '5'
        }
      });
    }

    return new Response(unpublishedHtml(slug), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const url = new URL(ctx.request.url);
  let path = url.pathname;
  if (path === '/') path = '/index.html';
  if (!path.startsWith('/')) path = '/' + path;

  const r2Key = `apps/${slug}/v${active}${path}`;
  let obj = await ctx.env.APPS.get(r2Key);

  if (!obj) {
    const isNavigation =
      !path.includes('.') ||
      path.endsWith('.html') ||
      ctx.request.headers.get('sec-fetch-mode') === 'navigate';
    if (isNavigation) {
      obj = await ctx.env.APPS.get(`apps/${slug}/v${active}/index.html`);
    }
  }

  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = new Uint8Array(await obj.arrayBuffer());
  const body = toResponseBody(bytes);
  const isWasm = path.endsWith('.wasm');
  const contentType = isWasm
    ? 'application/wasm'
    : (obj.httpMetadata?.contentType ?? 'application/octet-stream');

  const isHtml = contentType.startsWith('text/html');
  const cacheControl = isHtml
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Shippie-Version': String(active)
  };

  if (isWasm) {
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
  }

  if (isHtml) {
    const { injectPwaTags } = await import('../rewriter');
    const stream = injectPwaTags(toStream(bytes), { contentType, slug });
    return new Response(stream, { status: 200, headers });
  }

  return new Response(body, { status: 200, headers });
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

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

function buildingHtml(slug: string, flag: BuildingFlag): string {
  const started = flag.started_at
    ? new Date(flag.started_at).toISOString()
    : 'just now';
  const commit = flag.commit_sha ? flag.commit_sha.slice(0, 7) : 'latest';
  const source = flag.source ?? 'pipeline';
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${slug}.shippie.app — shipping…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<style>
  :root { color-scheme: dark; }
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #fafafa; min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 2rem; }
  .card { max-width: 36rem; text-align: center; }
  .tag { font: 12px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.1em; color: #f97316; margin-bottom: 1rem; }
  h1 { font-size: 2rem; margin: 0 0 1rem; }
  p  { margin: 0 0 1rem; opacity: 0.75; }
  .meta { font: 12px/1.6 ui-monospace, monospace; opacity: 0.5; border-top: 1px solid #222; padding-top: 1rem; margin-top: 1.5rem; text-align: left; }
  a { color: #f97316; text-decoration: none; }
  .pulse {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    background: #f97316; margin-right: 0.5em; vertical-align: middle;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
</style>
<div class="card">
  <p class="tag"><span class="pulse"></span>shippie.app · shipping</p>
  <h1>${slug} is being built</h1>
  <p>The deploy pipeline is running — preflight, trust scan, PWA injection, and R2 upload.
     This page refreshes every 5 seconds and flips to the live app as soon as the pointer is set.</p>
  <p><a href="https://shippie.app/stats">Live p50/p95 deploy stats →</a></p>
  <div class="meta">
    source:   ${source}<br>
    commit:   ${commit}<br>
    started:  ${started}
  </div>
</div>
</html>`;
}
