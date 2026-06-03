import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const suffix = params.path ? `/${params.path}` : '';
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(`/maker${suffix}${url.search}`)}`);
  }
  throw redirect(307, `/dashboard${suffix}${url.search}`);
};
