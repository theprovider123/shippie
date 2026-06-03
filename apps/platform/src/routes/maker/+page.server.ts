import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(`/maker${url.search}`)}`);
  }
  throw redirect(307, `/dashboard${url.search}`);
};
