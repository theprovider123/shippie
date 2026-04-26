/**
 * Root layout server load — exposes the signed-in user (if any) to every
 * route. Populated by `hooks.server.ts` from the Lucia session cookie.
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
  };
};
