/**
 * Generate a PWA manifest.json from a shippie.json.
 *
 * Returned object is JSON-serializable and matches the W3C Web App
 * Manifest spec + spec v6 §9.1 defaults.
 *
 * Optionally accepts a deploy-time AppProfile (from @shippie/analyse).
 * When present, the profile fills in gaps the maker didn't specify in
 * shippie.json — inferred name from <title>, primary colour from CSS,
 * etc. shippie.json always wins; the profile is the smart-defaults
 * layer beneath it.
 */
import type { ShippieJson } from '@shippie/shared';
import { manifestFromProfile, type ProfileLike } from './smart-defaults.ts';

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

export interface GenerateManifestOptions {
  /** Deploy-time inferred profile from @shippie/analyse. Optional. */
  profile?: ProfileLike;
}

export function generateManifest(
  manifest: ShippieJson,
  opts: GenerateManifestOptions = {},
): GeneratedManifest {
  const pwa = manifest.pwa ?? {};
  const smart = opts.profile
    ? manifestFromProfile(opts.profile, {
        themeColor: '#E8603C',
        backgroundColor: '#14120F',
        appName: manifest.name,
      })
    : null;

  return {
    name: manifest.name,
    short_name: manifest.name.slice(0, 12),
    description: manifest.description,
    start_url: pwa.start_url ?? '/',
    scope: pwa.scope ?? '/',
    display: pwa.display ?? 'standalone',
    orientation: pwa.orientation ?? 'portrait',
    theme_color: manifest.theme_color ?? smart?.theme_color ?? '#E8603C',
    background_color: manifest.background_color ?? smart?.background_color ?? '#14120F',
    icons: [
      { src: '/__shippie/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/__shippie/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    categories: manifest.category ? [manifest.category] : undefined,
  };
}
