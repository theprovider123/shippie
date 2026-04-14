/**
 * Generate a PWA manifest.json from a shippie.json.
 *
 * Returned object is JSON-serializable and matches the W3C Web App
 * Manifest spec + spec v6 §9.1 defaults.
 */
import type { ShippieJson } from '@shippie/shared';

export interface GeneratedManifest {
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  categories?: string[];
}

export function generateManifest(manifest: ShippieJson): GeneratedManifest {
  const pwa = manifest.pwa ?? {};
  return {
    name: manifest.name,
    short_name: manifest.name.slice(0, 12),
    description: manifest.description,
    start_url: pwa.start_url ?? '/',
    scope: pwa.scope ?? '/',
    display: pwa.display ?? 'standalone',
    orientation: pwa.orientation ?? 'portrait',
    theme_color: manifest.theme_color ?? '#f97316',
    background_color: manifest.background_color ?? '#ffffff',
    icons: [
      { src: '/__shippie/icons/192.png', sizes: '192x192', type: 'image/png' },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    categories: manifest.category ? [manifest.category] : undefined,
  };
}
