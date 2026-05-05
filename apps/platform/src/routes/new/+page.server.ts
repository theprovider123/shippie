/**
 * /new — public quick-ship page.
 *
 * Anonymous visitors can run the 60-second trial path. Signed-in makers
 * keep the slugged deploy + dashboard workflow.
 */
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  return {
    user: locals.user ? { email: locals.user.email } : null,
    installationId: url.searchParams.get('installation_id'),
  };
};
