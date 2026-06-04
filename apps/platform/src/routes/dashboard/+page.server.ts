/**
 * Legacy alias: /dashboard → /maker.
 *
 * The maker backend now lives under /maker/*. /dashboard/* stays as a
 * permanent (308) redirect so old links, emails, and bookmarks keep working.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  throw redirect(308, `/maker${url.search}`);
};
