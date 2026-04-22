// services/worker/src/router/manifest.ts
/**
 * __shippie/manifest
 *
 * Generated PWA manifest per deployed app. Merges three sources, in
 * precedence order:
 *   1. Platform defaults (id, start_url, scope, display, display_override,
 *      launch_handler, maskable icon) — the baseline every Shippie app
 *      inherits so the install experience is uniform.
 *   2. Meta (apps:{slug}:meta) — name, theme/background color.
 *   3. PWA overrides (apps:{slug}:pwa) — maker-declared manifest fields
 *      that override the platform defaults. Validated at deploy time
 *      against the `ShippieJsonPwa` schema.
 *
 * Spec §5.4, §10.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

interface AppMeta {
  name?: string;
  theme_color?: string;
  background_color?: string;
}

interface AppPwaOverrides {
  id?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  display_override?: readonly string[];
  orientation?: 'any' | 'portrait' | 'landscape';
  categories?: readonly string[];
  launch_handler?: {
    client_mode?: string | readonly string[];
  };
  share_target?: {
    action: string;
    method?: 'GET' | 'POST';
    enctype?: string;
    params?: Record<string, string>;
  };
  screenshots?: readonly {
    src: string;
    sizes: string;
    type: string;
    form_factor?: string;
    label?: string;
  }[];
  protocol_handlers?: readonly { protocol: string; url: string }[];
}

export const manifestRouter = new Hono<AppBindings>();

manifestRouter.get('/', async (c) => {
  const slug = c.var.slug;
  const [meta, pwa] = await Promise.all([
    c.env.APP_CONFIG.getJson<AppMeta>(`apps:${slug}:meta`),
    c.env.APP_CONFIG.getJson<AppPwaOverrides>(`apps:${slug}:pwa`),
  ]);

  const name = meta?.name ?? slug;
  const shortName = pwa?.short_name ?? name;

  const manifest = {
    name,
    short_name: shortName,
    description: pwa?.description ?? `Built with Shippie.`,
    id: pwa?.id ?? `/?app=${slug}`,
    start_url: pwa?.start_url ?? '/',
    scope: pwa?.scope ?? '/',
    display: pwa?.display ?? 'standalone',
    display_override: pwa?.display_override ?? ['standalone', 'minimal-ui'],
    orientation: pwa?.orientation ?? 'portrait',
    theme_color: meta?.theme_color ?? '#f97316',
    background_color: meta?.background_color ?? '#ffffff',
    launch_handler: pwa?.launch_handler ?? {
      client_mode: ['navigate-existing', 'auto'],
    },
    categories: pwa?.categories ?? [],
    icons: [
      {
        src: '/__shippie/icons/192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    ...(pwa?.screenshots ? { screenshots: pwa.screenshots } : {}),
    ...(pwa?.share_target ? { share_target: pwa.share_target } : {}),
    ...(pwa?.protocol_handlers ? { protocol_handlers: pwa.protocol_handlers } : {}),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
