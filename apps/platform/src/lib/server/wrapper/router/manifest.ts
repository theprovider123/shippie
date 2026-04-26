/**
 * /__shippie/manifest — synthesized PWA manifest. Ported from
 * services/worker/src/router/manifest.ts.
 *
 * Merges (lowest → highest precedence):
 *   - platform defaults
 *   - apps:{slug}:meta  (name, theme_color, background_color)
 *   - apps:{slug}:pwa   (maker-declared overrides validated at deploy time)
 */
import type { WrapperContext } from '../env';

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
  launch_handler?: { client_mode?: string | readonly string[] };
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

async function readJson<T>(
  cache: WrapperContext['env']['CACHE'],
  key: string
): Promise<T | null> {
  const raw = await cache.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function handleManifest(ctx: WrapperContext): Promise<Response> {
  const [meta, pwa] = await Promise.all([
    readJson<AppMeta>(ctx.env.CACHE, `apps:${ctx.slug}:meta`),
    readJson<AppPwaOverrides>(ctx.env.CACHE, `apps:${ctx.slug}:pwa`)
  ]);

  const name = meta?.name ?? ctx.slug;
  const shortName = pwa?.short_name ?? name;

  const manifest = {
    name,
    short_name: shortName,
    description: pwa?.description ?? `Built with Shippie.`,
    id: pwa?.id ?? `/?app=${ctx.slug}`,
    start_url: pwa?.start_url ?? '/',
    scope: pwa?.scope ?? '/',
    display: pwa?.display ?? 'standalone',
    display_override: pwa?.display_override ?? ['standalone', 'minimal-ui'],
    orientation: pwa?.orientation ?? 'portrait',
    theme_color: meta?.theme_color ?? '#f97316',
    background_color: meta?.background_color ?? '#ffffff',
    launch_handler: pwa?.launch_handler ?? {
      client_mode: ['navigate-existing', 'auto']
    },
    categories: pwa?.categories ?? [],
    icons: [
      { src: '/__shippie/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/__shippie/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    ...(pwa?.screenshots ? { screenshots: pwa.screenshots } : {}),
    ...(pwa?.share_target ? { share_target: pwa.share_target } : {}),
    ...(pwa?.protocol_handlers ? { protocol_handlers: pwa.protocol_handlers } : {})
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
