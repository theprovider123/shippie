/**
 * __shippie/sdk.js
 *
 * Serves the Shippie SDK bundle as same-origin JavaScript. At runtime in
 * production, the Worker pulls this from R2 (`shippie-public/sdk/v1.latest.js`)
 * and returns it with long cache headers + integrity.
 *
 * In dev, we return a tiny stub that loads the actual SDK from npm via an
 * inlined ES module. Replaced in Week 5 when packages/sdk is built.
 *
 * Spec v6 §7.2.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

const DEV_STUB = `// __shippie/sdk.js — dev stub
// Replaced in Week 5 with the real @shippie/sdk bundle served from R2.
(function () {
  if (typeof globalThis === 'undefined') return;
  const origin = (typeof location !== 'undefined' && location.origin) || '';
  const warn = (name) => () => {
    console.warn('[shippie] sdk.' + name + '() not wired yet — dev stub');
    return Promise.resolve(null);
  };
  const shippie = {
    version: 'dev-stub',
    origin,
    auth: {
      getUser: warn('auth.getUser'),
      signIn: warn('auth.signIn'),
      signOut: warn('auth.signOut'),
      onChange: () => () => {},
    },
    db: {
      set: warn('db.set'),
      get: warn('db.get'),
      list: warn('db.list'),
      delete: warn('db.delete'),
    },
    files: {
      upload: warn('files.upload'),
      get: warn('files.get'),
      delete: warn('files.delete'),
    },
    notify: {
      send: warn('notify.send'),
      subscribe: warn('notify.subscribe'),
    },
    track: (event, props) => {
      console.debug('[shippie] track', event, props);
    },
    feedback: {
      open: () => console.warn('[shippie] feedback.open() not wired'),
      submit: warn('feedback.submit'),
    },
    install: {
      prompt: () => console.warn('[shippie] install.prompt() not wired'),
      status: () => 'unsupported',
    },
    meta: async () => {
      const r = await fetch('/__shippie/meta');
      return r.ok ? r.json() : null;
    },
    native: {
      share: warn('native.share'),
      haptics: { impact: () => Promise.resolve() },
      deviceInfo: warn('native.deviceInfo'),
    },
  };
  globalThis.shippie = shippie;
  if (typeof window !== 'undefined') window.shippie = shippie;
})();
`;

export const sdkRouter = new Hono<AppBindings>();

sdkRouter.get('/', async (c) => {
  // Try to serve the real built SDK from R2 first.
  const obj = await c.env.SHIPPIE_PUBLIC.get('sdk/v1.latest.js');
  if (obj) {
    return new Response(toResponseBody(await obj.body()), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  }

  // Dev fallback
  return new Response(DEV_STUB, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
});
