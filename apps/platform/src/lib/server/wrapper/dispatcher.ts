/**
 * Maker-subdomain hostname dispatcher.
 *
 * Called from hooks.server.ts when the request hostname is a maker
 * subdomain (e.g. `chiwit.shippie.app`). Resolves the slug, runs the
 * private-app gate, dispatches `__shippie/*` routes locally, and
 * either reverse-proxies (wrap mode) or serves from R2 with HTMLRewriter
 * injection (static mode).
 *
 * Phase 5: this replaces the entire services/worker/ binary. One Worker
 * now serves shippie.app + all *.shippie.app traffic.
 */
import type { WrapperContext, WrapperEnv } from './env';
import { resolveAppSlug, resolveHostFull } from './routing';
import { loadAppMeta, loadWrapMeta } from './platform-client';
import { runAccessGate } from './router/access-gate';
import { proxyWrappedApp } from './router/proxy';
import { serveFromR2 } from './router/files';
import { handleHealth } from './router/health';
import { handleMeta } from './router/meta';
import { handleManifest } from './router/manifest';
import { handleSw } from './router/sw';
import { handleSdk } from './router/sdk';
import { handleIcon } from './router/icons';
import { handleSplash } from './router/splash';
import { handleAnalytics } from './router/analytics';
import { handleBeacon } from './router/beacon';
import { handleFeedback, handleFeedbackVote } from './router/feedback';
import { handleHandoff } from './router/handoff';
import {
  handlePushSubscribe,
  handlePushUnsubscribe,
  handlePushVapidKey
} from './router/push';
import { handleInstall } from './router/install';
import { handleLocalAsset, handleLocalScript } from './router/local';
import { handleYourData } from './router/your-data';
import {
  handleGroupChooser,
  handleGroupModerate
} from './router/group-moderate';

const TRACE_ID_HEADER = 'x-shippie-trace-id';

function mintTraceId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DispatchInput {
  request: Request;
  env: WrapperEnv;
}

/**
 * Returns a Response when the request belongs to a maker-subdomain
 * (or otherwise resolvable maker host); returns null when the host is
 * a platform host and the request should fall through to SvelteKit.
 */
export async function dispatchMakerSubdomain(
  input: DispatchInput
): Promise<Response | null> {
  const { request, env } = input;

  // Try sync resolution first (subdomain). Custom-domain async lookup
  // happens inside resolveHostFull below.
  let slug = resolveAppSlug(request);
  let isCanonical = true;
  let canonicalDomain: string | undefined;

  if (!slug) {
    const resolved = await resolveHostFull(request, env.CACHE);
    if (!resolved) return null; // not a maker host
    slug = resolved.slug;
    isCanonical = resolved.isCanonical;
    canonicalDomain = resolved.canonicalDomain;
  }

  // Canonical-domain redirect (custom domains).
  if (!isCanonical && canonicalDomain) {
    const url = new URL(request.url);
    url.hostname = canonicalDomain;
    return Response.redirect(url.toString(), 301);
  }

  const incomingTrace = request.headers.get(TRACE_ID_HEADER);
  const traceId =
    incomingTrace && /^[a-zA-Z0-9-]{1,64}$/.test(incomingTrace)
      ? incomingTrace
      : mintTraceId();

  const ctx: WrapperContext = { request, env, slug, traceId };

  // Access gate — runs before wrap/static so private wrapped apps are
  // also gated. Skipped for /__shippie/*.
  const meta = await loadAppMeta(env.CACHE, slug);
  const gated = await runAccessGate(ctx, { meta });
  if (gated) return finalizeWrapperResponse(gated, ctx);

  const url = new URL(request.url);
  const path = url.pathname;

  // System routes are always platform-owned, never the maker's.
  if (path.startsWith('/__shippie/')) {
    const res = await dispatchWrapperSystemRoute(ctx, path);
    if (res) return finalizeWrapperResponse(res, ctx);
    return finalizeWrapperResponse(
      Response.json(
        {
          error: 'not_found',
          message:
            'This __shippie/* route is not yet implemented in the current build.'
        },
        { status: 404 }
      ),
      ctx
    );
  }

  // Wrap mode → reverse proxy.
  const wrap = await loadWrapMeta(env.CACHE, slug);
  if (wrap) {
    return finalizeWrapperResponse(await proxyWrappedApp({ ctx, wrap }), ctx);
  }

  // Static maker app → R2.
  return finalizeWrapperResponse(await serveFromR2(ctx), ctx);
}

/**
 * Dispatch /__shippie/* paths. Returns null if no handler matches so
 * the caller can decide on the 404 shape.
 */
export async function dispatchWrapperSystemRoute(
  ctx: WrapperContext,
  path: string
): Promise<Response | null> {
  // exact-match handlers
  switch (path) {
    case '/__shippie/health':
      return handleHealth(ctx);
    case '/__shippie/meta':
      return handleMeta(ctx);
    case '/__shippie/manifest':
    case '/__shippie/manifest.json':
      return handleManifest(ctx);
    case '/__shippie/sw.js':
      return handleSw(ctx);
    case '/__shippie/sdk.js':
      return handleSdk(ctx);
    case '/__shippie/local.js':
      return handleLocalScript(ctx);
    case '/__shippie/install':
      return handleInstall(ctx);
    case '/__shippie/install/phone':
      return handleInstall(ctx);
    case '/__shippie/feedback':
      return handleFeedback(ctx);
    case '/__shippie/analytics':
      return handleAnalytics(ctx);
    case '/__shippie/beacon':
      return handleBeacon(ctx);
    case '/__shippie/handoff':
      return handleHandoff(ctx);
    case '/__shippie/push/vapid-key':
      return handlePushVapidKey(ctx);
    case '/__shippie/push/subscribe':
      return handlePushSubscribe(ctx);
    case '/__shippie/push/unsubscribe':
      return handlePushUnsubscribe(ctx);
    case '/__shippie/data':
      return handleYourData(ctx);
    case '/__shippie/group':
    case '/__shippie/group/':
      return handleGroupChooser(ctx);
  }

  // Pattern handlers
  // /__shippie/icons/{size}.png
  const iconMatch = path.match(/^\/__shippie\/icons\/([^/]+)$/);
  if (iconMatch) return handleIcon(ctx, iconMatch[1]!);

  // /__shippie/splash/{device}.png
  const splashMatch = path.match(/^\/__shippie\/splash\/([^/]+)$/);
  if (splashMatch) return handleSplash(ctx, splashMatch[1]!);

  // /__shippie/local/{asset}
  const localMatch = path.match(/^\/__shippie\/local\/([^/]+)$/);
  if (localMatch) return handleLocalAsset(ctx, localMatch[1]!);

  // /__shippie/feedback/{id}/vote
  const voteMatch = path.match(/^\/__shippie\/feedback\/([^/]+)\/vote$/);
  if (voteMatch) return handleFeedbackVote(ctx, voteMatch[1]!);

  // /__shippie/group/{id}/moderate
  const modMatch = path.match(/^\/__shippie\/group\/([^/]+)\/moderate$/);
  if (modMatch) return handleGroupModerate(ctx, modMatch[1]!);

  // /__shippie/signal/{roomId} — Phase 6 (DO).
  if (path.startsWith('/__shippie/signal/')) {
    return new Response(
      'Proximity signalling is wired up in Phase 6 (Durable Objects).',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  return null;
}

/**
 * Apply per-app CSP from KV + standard hardening headers + trace echo.
 */
export async function finalizeWrapperResponse(
  res: Response,
  ctx: WrapperContext
): Promise<Response> {
  // Headers may be immutable on certain Response subclasses (e.g.
  // Response.redirect()). Clone via a new Response so we can mutate.
  const out = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });

  if (!out.headers.has(TRACE_ID_HEADER)) {
    out.headers.set(TRACE_ID_HEADER, ctx.traceId);
  }

  if (!out.headers.has('content-security-policy')) {
    const appCsp = await ctx.env.CACHE.get(`apps:${ctx.slug}:csp`);
    out.headers.set(
      'content-security-policy',
      appCsp ??
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    );
  }
  if (!out.headers.has('x-content-type-options')) {
    out.headers.set('x-content-type-options', 'nosniff');
  }
  if (!out.headers.has('x-frame-options')) {
    out.headers.set('x-frame-options', 'DENY');
  }
  if (!out.headers.has('referrer-policy')) {
    out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  }

  return out;
}
