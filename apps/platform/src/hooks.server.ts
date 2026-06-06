/**
 * Request entry point for the SvelteKit Worker.
 *
 * Hostname routing in v0:
 *   - `next.shippie.app`   → SvelteKit platform (canary)
 *   - `shippie.app`         → SvelteKit platform (post-cutover)
 *   - `*.shippie.app`       → maker app subdomain — wrapper dispatcher
 *   - `ai.shippie.app`      → separately-deployed AI app (NOT this Worker; CF Pages)
 *
 * Phase 5: maker subdomain branch invokes the wrapper dispatcher
 * (lifted from services/worker/) to serve R2 files with HTMLRewriter
 * injection, reverse-proxy wrap-mode apps, and dispatch __shippie/*
 * routes. The platform↔worker HMAC boundary is gone — one Worker now
 * serves shippie.app + all *.shippie.app traffic.
 */
import type { Handle } from '@sveltejs/kit';
import { createLucia } from '$server/auth/lucia';
import {
  dispatchMakerSubdomain,
  dispatchWrapperSystemRoute,
  finalizeWrapperResponse,
} from '$server/wrapper/dispatcher';
import type { WrapperContext } from '$server/wrapper/env';
import {
  canonicalShowcaseSlug,
  canonicalShowcaseTarget,
  containerSlugForRequest,
  isFirstPartyShowcase,
} from '$lib/showcase-slugs';
import { curationFor } from '$lib/_generated/first-party-curation';
import { buildArcadeCsp } from '$lib/curation/arcade-csp';
import { withShippieRuntimeCsp } from '$lib/trust-ledger/runtime-csp';

const PLATFORM_HOSTS = new Set([
  'next.shippie.app',
  'shippie.app',
  'www.shippie.app',
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

const LOCAL_PLATFORM_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// First-party showcase apps are bundled into apps/platform/static/__shippie-run/
// at build time by scripts/prepare-showcases.mjs. Hitting
// <slug>.shippie.app rewrites to the apex /run/<slug>/ focused shell; the
// shell iframes internal /__shippie-run/<slug>/ runtime assets. Maker apps
// (everything else under *.shippie.app) still flow through the wrapper dispatcher.
//
// First-party showcase slug list lives in `$lib/showcase-slugs` so
// the marketplace server load can read the same source of truth.

export const handle: Handle = async ({ event, resolve }) => {
  const hostname = event.url.hostname;

  // Maker app subdomains — dispatch into the wrapper.
  if (
    hostname.endsWith('.shippie.app') &&
    !PLATFORM_HOSTS.has(hostname) &&
    hostname !== 'ai.shippie.app'
  ) {
    // First-party showcase: <slug>.shippie.app/* redirects to the
    // canonical apex /run/<slug>/ surface. System routes stay on the
    // subdomain and use the same wrapper route handlers as maker apps,
    // so /__shippie/data, /__shippie/analytics, /__shippie/install,
    // and friends work before/after the apex handoff.
    //
    // We tried serving app assets via
    // ASSETS.fetch from the subdomain context, but the binding refuses
    // cross-host fetches and synthesises a 522. A 302 keeps URLs
    // working — the address bar just changes from <slug>.shippie.app
    // to shippie.app/run/<slug>/. Subdomain hygiene is acceptable;
    // 522s aren't.
    const subdomain = hostname.slice(0, -'.shippie.app'.length);
    if (isFirstPartyShowcase(subdomain)) {
      const showcaseTarget = canonicalShowcaseTarget(subdomain);
      const showcaseSlug = showcaseTarget.slug;
      if (event.url.pathname.startsWith('/__shippie/')) {
        if (!event.platform?.env) {
          return new Response('Platform bindings unavailable.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
        const ctx: WrapperContext = {
          request: event.request,
          env: event.platform.env,
          slug: containerSlugForRequest(subdomain),
          traceId: firstPartyTraceId(event.request),
        };
        const res = await dispatchWrapperSystemRoute(ctx, event.url.pathname);
        return finalizeWrapperResponse(
          res ??
            Response.json(
              {
                error: 'not_found',
                message:
                  'This __shippie/* route is not yet implemented in the current build.',
              },
              { status: 404 },
            ),
          ctx,
        );
      }
      const targetPath = event.url.pathname === '/' ? '/' : event.url.pathname;
      const search = new URLSearchParams(event.url.search);
      for (const [key, value] of Object.entries(showcaseTarget.searchParams ?? {})) {
        search.set(key, value);
      }
      const query = search.toString();
      const target = `https://shippie.app/run/${showcaseSlug}${targetPath}${query ? `?${query}` : ''}`;
      return new Response(null, {
        status: 302,
        headers: { location: target, 'cache-control': 'public, max-age=300' },
      });
    }

    if (!event.platform?.env) {
      return new Response('Platform bindings unavailable.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
    const res = await dispatchMakerSubdomain({
      request: event.request,
      env: event.platform.env
    });
    if (res) return res;
    // Fell through — let SvelteKit handle (rare; only for hosts that
    // resolveHostFull returns null for). Should be a 404 page.
  }

  const runtimeAssetResponse = await runtimeAssetTarget(event);
  if (runtimeAssetResponse) return runtimeAssetResponse;

  // Platform host — wire Lucia.
  event.locals.user = null;
  event.locals.session = null;
  event.locals.lucia = null;

  if (event.platform?.env.DB) {
    const lucia = createLucia(event.platform.env.DB, event.platform.env);
    event.locals.lucia = lucia;

    const sessionId = event.cookies.get(lucia.sessionCookieName) ?? null;
    if (sessionId) {
      try {
        const { session, user } = await lucia.validateSession(sessionId);
        if (session && session.fresh) {
          const cookie = lucia.createSessionCookie(session.id);
          event.cookies.set(cookie.name, cookie.value, {
            path: '.',
            ...cookie.attributes
          });
        }
        if (!session) {
          const blank = lucia.createBlankSessionCookie();
          event.cookies.set(blank.name, blank.value, {
            path: '.',
            ...blank.attributes
          });
        }
        if (user) {
          // Populate locals.user with our app shape (id from row PK + attrs).
          event.locals.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isAdmin: user.isAdmin
          };
        }
        event.locals.session = session;
      } catch (err) {
        console.error('[auth] session validation failed; continuing anonymous', err);
        const blank = lucia.createBlankSessionCookie();
        event.cookies.set(blank.name, blank.value, {
          path: '.',
          ...blank.attributes
        });
      }
    }
  }

  return resolve(event);
};

function firstPartyTraceId(request: Request): string {
  const incoming = request.headers.get('x-shippie-trace-id');
  if (incoming && /^[a-zA-Z0-9-]{1,64}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

async function runtimeAssetTarget(event: Parameters<Handle>[0]['event']): Promise<Response | null> {
  if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return null;
  const match = /^\/__shippie-run\/([^/]+)(?:\/(.*))?$/.exec(event.url.pathname);
  if (!match) return null;
  const slug = match[1]!;
  if (LOCAL_PLATFORM_HOSTS.has(event.url.hostname)) {
    const localAssetPath = match[2] ?? '';
    if (localAssetPath.includes('.')) return null;
    const fallbackUrl = new URL(event.url);
    fallbackUrl.pathname = `/__shippie-run/${slug}/index.html`;
    return event.fetch(fallbackUrl);
  }
  const assetPath = match[2] ?? '';

  const assets = event.platform?.env.ASSETS;
  if (!assets) return null;

  const response = asFreshRuntimeShell(assetPath, await assets.fetch(event.url));
  if (response.status === 404 && !assetPath.includes('.')) {
    const fallbackUrl = new URL(event.url);
    fallbackUrl.pathname = `/__shippie-run/${slug}/index.html`;
    return withShippieRuntimeCsp(
      withArcadeCspIfArcade(slug, asFreshRuntimeShell('index.html', await assets.fetch(fallbackUrl))),
    );
  }
  return withShippieRuntimeCsp(withArcadeCspIfArcade(slug, response));
}

function asFreshRuntimeShell(assetPath: string, response: Response): Response {
  if (!response.ok) return response;
  const contentType = response.headers.get('content-type') ?? '';
  const shellLike =
    assetPath === '' ||
    assetPath.endsWith('/') ||
    assetPath.endsWith('.html') ||
    assetPath.endsWith('.webmanifest') ||
    contentType.includes('text/html') ||
    contentType.includes('manifest+json');
  if (!shellLike) return response;

  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('cdn-cache-control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wrap an `assets.fetch()` response with the arcade CSP header when
 * the slug is a first-party arcade showcase. Preserves status, all
 * existing headers (incl. cache-control / etag / content-type /
 * content-encoding), and the body stream — never re-encodes or
 * buffers. Defence-in-depth alongside the bake-time `<meta>` tag.
 *
 * Non-arcade slugs return the original response unchanged.
 */
function withArcadeCspIfArcade(slug: string, response: Response): Response {
  const entry = curationFor(slug);
  if (entry?.surface !== 'arcade') return response;
  // Don't inject on error responses — those are usually 404 HTML the
  // SvelteKit error template renders, and a stale CSP would attach
  // to the wrong origin context.
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  // If a CSP is already present (defence-in-depth from the meta tag
  // can't set this header; only this code path does), don't double-set.
  if (!headers.has('content-security-policy')) {
    headers.set('content-security-policy', buildArcadeCsp());
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
