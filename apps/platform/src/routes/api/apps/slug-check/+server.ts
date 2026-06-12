/**
 * GET /api/apps/slug-check?slug=<slug>[&exclude=<current-slug>]
 *
 * Returns { available: boolean } — used by the maker identity editor to
 * validate a slug before submitting a rename. The optional `exclude`
 * parameter exempts the app's own current slug so the check stays green
 * while the maker types the same value back.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { checkAppSlugAvailability } from '$server/apps/slug-availability';

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ available: false, reason: 'unavailable' });

  const slug = event.url.searchParams.get('slug') ?? '';
  const exclude = event.url.searchParams.get('exclude') ?? '';

  const db = getDrizzleClient(env.DB);
  const availability = await checkAppSlugAvailability(db, slug, { excludeSlug: exclude });

  return json({
    available: availability.available,
    reason: availability.reason,
    targetSlug: availability.targetSlug ?? null,
  });
};
