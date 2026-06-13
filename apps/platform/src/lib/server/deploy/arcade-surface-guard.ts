import type { Surface } from '$lib/curation/schema';
import { bakedArcadeGameSlugs } from '$server/arcade/roster';

/**
 * `surface='arcade'` is honored ONLY for baked first-party arcade games.
 * Any other app (maker, remix, unbaked) that resolves to 'arcade' — via
 * manifest, form, OR a preserved existing row — is clamped to 'featured'.
 */
export function clampArcadeSurface(input: { slug: string; surface: Surface }): {
  surface: Surface;
  downgraded: boolean;
} {
  if (input.surface !== 'arcade') return { surface: input.surface, downgraded: false };
  if (bakedArcadeGameSlugs().has(input.slug)) return { surface: 'arcade', downgraded: false };
  return { surface: 'featured', downgraded: true };
}
