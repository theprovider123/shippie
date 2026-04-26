/**
 * /new — auth-gated three-card picker page.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return {
    user: { email: locals.user.email },
    installationId: url.searchParams.get('installation_id'),
  };
};
