import type { PageServerLoad } from './$types';
import { safeReturnTo } from '$server/auth/return-to';

export const load: PageServerLoad = async ({ url }) => {
  return {
    returnTo: safeReturnTo(url.searchParams.get('return_to'), '/you'),
  };
};
