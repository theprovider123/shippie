/**
 * Maps a host city code to the CSS treatment class applied to a match card.
 *
 * Treatment tiers (per design system v1):
 *   Hero     — bespoke top motif + palette (Mexico City, NY/NJ, Los Angeles)
 *   Featured — palette + soft motif (Miami, Toronto, Vancouver, Guadalajara, Monterrey)
 *   Curated  — palette-only via inline CSS custom properties
 *
 * Hero and Featured cities consume named treatment classes defined in
 * styles.css. Curated cities return an empty string and rely on the
 * --city-a/--city-b inline custom properties on parent components.
 */
const TREATMENTS: Record<string, string> = {
  // Hero
  'MEX-CITY': 'mexico-city-treatment',
  NYNJ: 'ny-nj-treatment',
  LA: 'la-treatment',
  // Featured
  MIA: 'miami-treatment',
  TOR: 'toronto-treatment',
  VAN: 'vancouver-treatment',
  GDL: 'guadalajara-treatment',
  MTY: 'monterrey-treatment',
};

export function cityTreatmentClass(cityCode: string | undefined | null): string {
  if (!cityCode) return '';
  return TREATMENTS[cityCode] ?? '';
}

export function cityTier(cityCode: string | undefined | null): 'hero' | 'featured' | 'curated' {
  if (!cityCode) return 'curated';
  if (cityCode === 'MEX-CITY' || cityCode === 'NYNJ' || cityCode === 'LA') return 'hero';
  if (['MIA', 'TOR', 'VAN', 'GDL', 'MTY'].includes(cityCode)) return 'featured';
  return 'curated';
}
