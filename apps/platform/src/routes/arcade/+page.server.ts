import type { PageServerLoad } from './$types';
import { redirectRetiredRoute } from '$lib/server/launch-redirects';

export const load: PageServerLoad = ({ url }) => {
  redirectRetiredRoute(url, '/arcade');
  return {
    featured: [] as Array<{
      slug: string;
      name: string;
      shortName?: string;
      description: string | null;
      icon?: string;
      accent?: string;
      standaloneUrl?: string;
    }>,
    shelves: [] as Array<{
      key: string;
      title: string;
      subtitle: string;
      games: Array<{
        slug: string;
        name: string;
        shortName?: string;
        description: string | null;
        icon?: string;
        accent?: string;
        standaloneUrl?: string;
      }>;
    }>,
  };
};
