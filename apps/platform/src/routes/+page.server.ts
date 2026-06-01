/**
 * The Workspace is the front door. Root always lands there; the catalog
 * lives at /tools. (Reverses the old /container -> / bounce.)
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  redirect(307, `/workspace${url.search ?? ''}`);
};
