/**
 * Admin auth gate.
 *
 * Two layers:
 *  1. Not signed in → 303 to /auth/login with return_to so post-login
 *     drops them where they were headed.
 *  2. Signed in but not an admin → 404. We deliberately mask the
 *     existence of the admin surface; a 403 would be a confirmation
 *     that "/admin/*" exists.
 *
 * Used by:
 *  - +layout.server.ts loaders (whole admin surface)
 *  - form action handlers (re-check, since SvelteKit actions don't
 *    inherit a parent load's gate the same way pages do)
 */
import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  isAdmin: true;
}

/**
 * Throws redirect(303) if not signed in, error(404) if signed in but
 * not admin. Returns the (narrowed) admin user on success.
 */
export function requireAdmin(event: RequestEvent): AdminUser {
  const { locals, url } = event;
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (!locals.user.isAdmin) {
    throw error(404, 'Not found');
  }
  return {
    id: locals.user.id,
    email: locals.user.email,
    username: locals.user.username,
    displayName: locals.user.displayName,
    isAdmin: true,
  };
}
