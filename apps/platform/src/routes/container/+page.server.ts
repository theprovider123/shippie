/**
 * Back-compat: the workspace moved to /workspace. Preserve the query so
 * deep-links (?app=…&focused=1, ?section=data, ?open=…, ?import=package)
 * still resolve.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  redirect(308, `/workspace${url.search ?? ''}`);
};
