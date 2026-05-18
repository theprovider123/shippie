import type { PageServerLoad } from './$types';
import { redirectRetiredRoute } from '$lib/server/launch-redirects';

export const load: PageServerLoad = ({ url }) => {
  redirectRetiredRoute(url, '/professionals');
  return {};
};
