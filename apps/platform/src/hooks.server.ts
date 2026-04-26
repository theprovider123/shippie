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

export const handle: Handle = async ({ event, resolve }) => {
  const hostname = event.url.hostname;

  // Maker app subdomains — dispatch into the wrapper.
  if (
    hostname.endsWith('.shippie.app') &&
    !PLATFORM_HOSTS.has(hostname) &&
    hostname !== 'ai.shippie.app'
  ) {
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
