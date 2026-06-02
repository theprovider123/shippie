/**
 * Back-compat: Dock is canonical at /dock. Preserve the query so old
 * workspace links (?app=…, ?section=data, ?open=…, ?import=package)
 * still resolve.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  redirect(308, `/dock${url.search ?? ''}`);
};
