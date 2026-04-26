/**
 * /dashboard/apps — full apps list. Uses the layout-loaded `myApps`.
 *
 * No DB call here — the layout server load already pulls them. The page
 * just renders.
 */
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const layout = await parent();
  return { apps: layout.myApps };
};
