/**
 * Maker files router. Ported from services/worker/src/router/files.ts.
 *
 * Catch-all that serves the app's built files from R2 at
 * `apps/{slug}/v{active}/<path>`. SPA fallback is enabled only for
 * deploys classified as SPA; MPA deploys resolve /route/index.html and then
 * return 404 for unknown navigations.
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

interface RuntimeMeta {
  name?: string;
  theme_color?: string;
  routing?: {
    mode?: 'spa' | 'mpa';
  };
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

    // Auto-bridge: a maker hasn't published via the deploy pipeline, but a
    // statically-baked /run/<slug> shell exists in Workers Assets. Redirect
    // to the canonical static URL so first-party showcases (and seeded apps
    // like mevrouw) work without the maker clicking Ship-Now. Building wins
    // over this — that's why this branch sits below the building check.
    const bridged = await tryStaticBridge(ctx, slug);
    if (bridged) return bridged;

    return new Response(unpublishedHtml(slug), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const url = new URL(ctx.request.url);
  let path = url.pathname;
  if (path === '/') path = '/index.html';
  if (!path.startsWith('/')) path = '/' + path;
  const meta = await readRuntimeMeta(ctx, slug);
  const routeMode = meta?.routing?.mode === 'mpa' ? 'mpa' : 'spa';

  const r2Key = `apps/${slug}/v${active}${path}`;
  let obj = await ctx.env.APPS.get(r2Key);

  if (!obj) {
    const directoryIndexPath = directoryIndexFor(path);
    if (directoryIndexPath) {
      obj = await ctx.env.APPS.get(`apps/${slug}/v${active}${directoryIndexPath}`);
      if (obj) path = directoryIndexPath;
    }
  }

  if (!obj && routeMode === 'spa') {
    const isNavigation =
      !path.includes('.') ||
      path.endsWith('.html') ||
      ctx.request.headers.get('sec-fetch-mode') === 'navigate';
    if (isNavigation) {
      obj = await ctx.env.APPS.get(`apps/${slug}/v${active}/index.html`);
      if (obj) path = '/index.html';
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
    const html = new TextDecoder().decode(bytes);
    const headPrepend = buildShareHead({
      slug,
      meta,
      html,
      requestUrl: url,
      platformOrigin: ctx.env.PUBLIC_ORIGIN
    });
    const stream = injectPwaTags(toStream(bytes), { contentType, slug, headPrepend });
    return new Response(stream, { status: 200, headers });
  }

  return new Response(body, { status: 200, headers });
}

async function readRuntimeMeta(ctx: WrapperContext, slug: string): Promise<RuntimeMeta | null> {
  const raw = await ctx.env.CACHE.get(`apps:${slug}:meta`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RuntimeMeta;
  } catch {
    return null;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char
  ));
}

function ogTag(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeAttr(content)}" data-shippie-share="1">`;
}

function namedTag(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeAttr(content)}" data-shippie-share="1">`;
}

/**
 * Share/OG meta tags prepended into <head> of wrapped-app HTML so subdomain
 * links unfurl as the APP (name + PNG card) instead of nothing. Skipped
 * entirely when the app already declares its own og:image — the substring
 * check is deliberately cheap (we already hold the full document in memory).
 * theme-color is injected separately (apps that didn't ship one are
 * uninstallable-looking) from the deploy-time KV meta the route-mode read
 * already loaded.
 */
function buildShareHead(opts: {
  slug: string;
  meta: RuntimeMeta | null;
  html: string;
  requestUrl: URL;
  platformOrigin: string;
}): string | undefined {
  const tags: string[] = [];

  if (!opts.html.includes('og:image')) {
    const name = opts.meta?.name?.trim() || opts.slug;
    let origin = 'https://shippie.app';
    try {
      origin = new URL(opts.platformOrigin).origin;
    } catch {
      // Keep the production default when PUBLIC_ORIGIN is malformed/unset.
    }
    const image = `${origin}/api/apps/${encodeURIComponent(opts.slug)}/og.png`;
    tags.push(
      ogTag('og:title', name),
      ogTag('og:description', `${name} on Shippie`),
      ogTag('og:site_name', 'Shippie'),
      ogTag('og:url', `${opts.requestUrl.origin}/`),
      ogTag('og:image', image),
      ogTag('og:image:width', '1200'),
      ogTag('og:image:height', '630'),
      namedTag('twitter:card', 'summary_large_image')
    );
  }

  const themeColor = opts.meta?.theme_color?.trim();
  if (themeColor && !opts.html.includes('theme-color')) {
    tags.push(namedTag('theme-color', themeColor));
  }

  return tags.length > 0 ? tags.join('') : undefined;
}

function directoryIndexFor(path: string): string | null {
  if (path.includes('.')) return null;
  const clean = path.endsWith('/') ? path.slice(0, -1) : path;
  if (!clean || clean === '/index.html') return null;
  return `${clean}/index.html`;
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

async function tryStaticBridge(
  ctx: WrapperContext,
  slug: string
): Promise<Response | null> {
  const assets = ctx.env.ASSETS;
  if (!assets) return null;

  // Probe the internal static runtime. Workers Assets matches by pathname,
  // so the host on the probe URL is irrelevant — but use shippie.app to
  // keep the redirect target self-consistent.
  const probeUrl = `https://shippie.app/__shippie-run/${encodeURIComponent(slug)}/index.html`;
  let probe: Response;
  try {
    probe = await assets.fetch(new Request(probeUrl, { method: 'GET' }));
  } catch {
    return null;
  }
  // Drain so the binding doesn't leak.
  try {
    await probe.body?.cancel();
  } catch {
    /* noop */
  }
  if (!probe.ok) return null;

  const incoming = new URL(ctx.request.url);
  // Strip leading slash so we don't double up — pathname always starts with /.
  const targetPath = incoming.pathname === '/' ? '' : incoming.pathname;
  const target =
    incoming.pathname === '/'
      ? `https://shippie.app/${encodeURIComponent(slug)}${incoming.search}`
      : `https://shippie.app/run/${encodeURIComponent(slug)}${targetPath}${incoming.search}`;
  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      'cache-control': 'public, max-age=300',
      'x-shippie-bridge': 'static'
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
