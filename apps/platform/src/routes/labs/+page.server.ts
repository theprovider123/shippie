import type { PageServerLoad } from './$types';
import { redirectRetiredRoute } from '$lib/server/launch-redirects';

export const load: PageServerLoad = ({ url }) => {
  redirectRetiredRoute(url, '/labs');
  return {
    apps: [] as Array<{
      slug: string;
      name: string;
      description: string | null;
      standaloneUrl?: string;
    }>,
  };
};
