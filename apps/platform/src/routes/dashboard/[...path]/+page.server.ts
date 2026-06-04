/**
 * Legacy alias: /dashboard/* → /maker/*.
 *
 * Preserves all deep links (e.g. /dashboard/apps/<slug>/feedback) and query
 * strings with a permanent (308) redirect to the matching /maker path.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
  const suffix = params.path ? `/${params.path}` : '';
  throw redirect(308, `/maker${suffix}${url.search}`);
};
