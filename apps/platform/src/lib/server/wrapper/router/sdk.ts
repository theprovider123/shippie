/**
 * /__shippie/sdk.js — Shippie SDK bundle. Ported from
 * services/worker/src/router/sdk.ts.
 *
 * Production: served from R2 (`sdk/v1.latest.js` in the ASSETS bucket).
 * Dev / unprovisioned: returns a tiny stub so the SDK shape exists.
 */
import type { WrapperContext } from '../env';
import { toResponseBody } from '../bytes';

const DEV_STUB = `// __shippie/sdk.js — dev stub (with PWA install wiring)
(function () {
  if (typeof globalThis === 'undefined') return;
  const origin = (typeof location !== 'undefined' && location.origin) || '';
  const warn = (name) => () => {
    console.warn('[shippie] sdk.' + name + '() not wired yet — dev stub');
    return Promise.resolve(null);
  };

  // Capture the beforeinstallprompt event so shippie.install.prompt()
  // can fire the native install dialog. Chrome only emits this after a
  // service worker is registered with a fetch handler.
  let bipEvent = null;
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      bipEvent = e;
    });
  }

  // Register the wrapper service worker. Required for Chrome to consider
  // the page installable.
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/__shippie/sw.js', { scope: '/' })
        .catch((err) => console.warn('[shippie] sw register failed', err));
    });
  }

  const installStatus = () => {
    if (typeof window === 'undefined') return 'unsupported';
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'installed';
    return bipEvent ? 'installable' : 'not-yet-available';
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
      prompt: async () => {
        if (!bipEvent) {
          console.warn('[shippie] install.prompt(): not installable yet');
          return { outcome: 'unavailable' };
        }
        const evt = bipEvent;
        bipEvent = null;
        await evt.prompt();
        return evt.userChoice;
      },
      status: installStatus,
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

export async function handleSdk(ctx: WrapperContext): Promise<Response> {
  const obj = await ctx.env.PLATFORM_ASSETS.get('sdk/v1.latest.js');
  if (obj) {
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return new Response(toResponseBody(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
      }
    });
  }

  return new Response(DEV_STUB, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
