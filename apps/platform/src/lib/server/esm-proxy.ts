/**
 * esm.sh proxy — Phase 2 of the on-device AI runtime hosting story.
 *
 * The container's AI worker dynamic-imports an ESM bundle of
 * `@huggingface/transformers`. Phase 1 pointed that import directly at
 * esm.sh's CDN; Phase 2 mirrors the same artifact through Shippie's
 * own origin so the runtime stops depending on a third party at
 * request time.
 *
 * How it works:
 *  - Each request to `/__esm/<path>` proxies through to
 *    `https://esm.sh/<path>` (any path the upstream CDN serves).
 *  - JavaScript responses get their absolute esm.sh-style import
 *    paths rewritten to live under our `/__esm/` namespace so
 *    transitive imports (onnxruntime-web, /node/buffer.mjs, etc.)
 *    keep resolving through us, never hitting esm.sh once a closure
 *    is warmed.
 *  - CF's edge cache holds the immutable responses; SvelteKit's
 *    Cloudflare adapter exposes `caches.default` via the platform
 *    binding for explicit cache-warm if needed (deferred — the
 *    response cache-control headers do enough).
 *
 * Why a proxy and not a build-time bundle: bundling
 * `@huggingface/transformers` ourselves works for the JS surface but
 * onnxruntime-web's WASM loading is fiddly to retarget at a static
 * path. A streaming proxy mirrors esm.sh's solved transitive graph
 * without us having to recreate it.
 */

const ESM_BASE = 'https://esm.sh';

/**
 * Absolute esm.sh-style paths in JS bodies start with a single `/`
 * followed by anything that's NOT already our prefix. We catch the
 * three syntactic positions: static `from`, static `import`, and
 * dynamic `import()`. Each capture preserves the surrounding quote
 * character so the replacement is symmetric.
 */
type ReplaceFn = (substring: string, ...args: string[]) => string;

const REWRITE_PATTERNS: ReadonlyArray<{ re: RegExp; replace: ReplaceFn }> = [
  // from "/foo" or from '/foo'
  {
    re: /(\bfrom\s*)(["'])\/(?!__esm\/)([^"']+)\2/g,
    replace: ((_m: string, lead: string, q: string, rest: string) =>
      `${lead}${q}/__esm/${rest}${q}`) as ReplaceFn,
  },
  // static import "/foo" (side-effect import, no `from`)
  {
    re: /(\bimport\s+)(["'])\/(?!__esm\/)([^"']+)\2/g,
    replace: ((_m: string, lead: string, q: string, rest: string) =>
      `${lead}${q}/__esm/${rest}${q}`) as ReplaceFn,
  },
  // dynamic import("/foo")
  {
    re: /(\bimport\s*\(\s*)(["'])\/(?!__esm\/)([^"']+)\2(\s*\))/g,
    replace: ((_m: string, lead: string, q: string, rest: string, tail: string) =>
      `${lead}${q}/__esm/${rest}${q}${tail}`) as ReplaceFn,
  },
];

export function rewriteEsmBody(body: string): string {
  let out = body;
  for (const { re, replace } of REWRITE_PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

const JS_CONTENT_TYPES = new Set([
  'application/javascript',
  'application/javascript; charset=utf-8',
  'text/javascript',
  'text/javascript; charset=utf-8',
]);

function isJsContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Tolerate parameters / capitalisation.
  const normalised = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  return normalised === 'application/javascript' || normalised === 'text/javascript';
}

export interface ProxyOptions {
  /** Override for tests — defaults to the global `fetch`. */
  fetcher?: typeof fetch;
  /** Override the upstream base — defaults to `https://esm.sh`. */
  base?: string;
}

/**
 * Proxy a single request from `/__esm/<path>` to `<base>/<path>`.
 * Streams the body, rewrites JS imports, sets immutable cache headers.
 */
export async function proxyEsmRequest(
  path: string,
  search: string,
  opts: ProxyOptions = {},
): Promise<Response> {
  const fetcher = opts.fetcher ?? fetch;
  const base = opts.base ?? ESM_BASE;
  // Strip any leading slash so we can re-anchor cleanly.
  const trimmedPath = path.replace(/^\/+/, '');
  const upstream = `${base}/${trimmedPath}${search}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetcher(upstream, {
      // esm.sh sets long-lived immutable cache; no special request
      // headers needed beyond a polite UA.
      headers: { 'user-agent': 'shippie-esm-proxy/1.0 (+https://shippie.app)' },
    });
  } catch {
    return new Response('upstream esm.sh unreachable', { status: 502 });
  }

  if (!upstreamRes.ok) {
    // Pass through the upstream status code so callers can distinguish
    // "we proxied a 404" from "we couldn't reach esm.sh".
    return new Response(`upstream returned ${upstreamRes.status}`, {
      status: upstreamRes.status,
    });
  }

  const contentType = upstreamRes.headers.get('content-type');
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  // Anything esm.sh ships is immutable per their pinning rules; mirror
  // that here so CF's edge holds it forever.
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');

  if (isJsContentType(contentType)) {
    const body = await upstreamRes.text();
    const rewritten = rewriteEsmBody(body);
    return new Response(rewritten, { status: 200, headers });
  }

  // Non-JS (WASM, JSON, type defs, etc.): stream through unmodified.
  const buffer = await upstreamRes.arrayBuffer();
  return new Response(buffer, { status: 200, headers });
}
