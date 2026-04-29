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
import { dispatchMakerSubdomain } from '$server/wrapper/dispatcher';

const PLATFORM_HOSTS = new Set(['next.shippie.app', 'shippie.app', 'www.shippie.app', 'localhost']);

// First-party showcase apps bundled into apps/platform/static/run/ at
// build time by scripts/prepare-showcases.mjs. Hitting
// <slug>.shippie.app rewrites to /run/<slug>/* so the Cloudflare
// adapter serves their dist directly. Maker apps (everything else
// under *.shippie.app) still flow through the wrapper dispatcher.
//
// Keep this set in sync with the slugs the prepare script produces
// (apps/showcase-*/shippie.json:slug, falling back to dir name).
const FIRST_PARTY_SHOWCASE_SLUGS = new Set<string>([
  'recipe',
  'journal',
  'whiteboard',
  'live-room',
  'habit-tracker',
  'workout-logger',
  'pantry-scanner',
  'meal-planner',
  'shopping-list',
  'sleep-logger',
  'body-metrics',
  'caffeine-log',
  'hydration',
  'mood-pulse',
  'symptom-tracker',
  'steps-counter',
]);

export const handle: Handle = async ({ event, resolve }) => {
  const hostname = event.url.hostname;

  // Maker app subdomains — dispatch into the wrapper.
  if (
    hostname.endsWith('.shippie.app') &&
    !PLATFORM_HOSTS.has(hostname) &&
    hostname !== 'ai.shippie.app'
  ) {
    // First-party showcase: <slug>.shippie.app/* redirects to the
    // canonical /run/<slug>/* on the apex host. We tried serving via
    // ASSETS.fetch from the subdomain context, but the binding refuses
    // cross-host fetches and synthesises a 522. A 302 keeps URLs
    // working — the address bar just changes from <slug>.shippie.app
    // to shippie.app/run/<slug>/. Subdomain hygiene is acceptable;
    // 522s aren't.
    const subdomain = hostname.slice(0, -'.shippie.app'.length);
    if (FIRST_PARTY_SHOWCASE_SLUGS.has(subdomain)) {
      const targetPath = event.url.pathname === '/' ? '/' : event.url.pathname;
      const target = `https://shippie.app/run/${subdomain}${targetPath}${event.url.search}`;
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

  // Platform host — wire Lucia.
  event.locals.user = null;
  event.locals.session = null;
  event.locals.lucia = null;

  if (event.platform?.env.DB) {
    const lucia = createLucia(event.platform.env.DB, event.platform.env);
    event.locals.lucia = lucia;

    const sessionId = event.cookies.get(lucia.sessionCookieName) ?? null;
    if (sessionId) {
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
    }
  }

  return resolve(event);
};
