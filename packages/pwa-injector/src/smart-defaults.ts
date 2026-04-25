/**
 * Smart-defaults for the PWA manifest, derived from a deploy-time
 * AppProfile. The maker's `shippie.json` always wins; profile values
 * fill in the gaps. Fallbacks are the platform's brand defaults.
 *
 * Defined as a structural type (`ProfileLike`) so this module doesn't
 * depend on @shippie/analyse at type-resolution time — keeps the
 * pwa-injector package lean.
 */

export interface ManifestSmartDefaults {
  name: string;
  short_name: string;
  theme_color: string;
  background_color: string;
  display: 'standalone';
  /** Best-guess icon source path within the bundle, or null. */
  iconHref: string | null;
}

export interface ProfileLike {
  inferredName: string;
  design: {
    primaryColor: string | null;
    backgroundColor: string | null;
    iconHrefs: readonly string[];
  };
}

export interface ManifestFallback {
  themeColor: string;
  backgroundColor: string;
  appName: string;
}

export function manifestFromProfile(
  profile: ProfileLike,
  fallback: ManifestFallback,
): ManifestSmartDefaults {
  return {
    name: profile.inferredName || fallback.appName,
    short_name: shortName(profile.inferredName || fallback.appName),
    theme_color: profile.design.primaryColor ?? fallback.themeColor,
    background_color: profile.design.backgroundColor ?? fallback.backgroundColor,
    display: 'standalone',
    iconHref: pickBestIcon(profile.design.iconHrefs),
  };
}

function shortName(name: string): string {
  if (name.length <= 12) return name;
  const firstWord = name.split(/\s+/)[0] ?? name;
  return firstWord.slice(0, 12);
}

function pickBestIcon(hrefs: readonly string[]): string | null {
  if (hrefs.length === 0) return null;
  // Prefer apple-touch-icon — usually the highest-quality artwork in
  // the bundle. Fall back to whatever's first.
  const apple = hrefs.find((h) => /apple/i.test(h));
  if (apple) return apple;
  return hrefs[0]!;
}
