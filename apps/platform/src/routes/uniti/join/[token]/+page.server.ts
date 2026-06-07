/**
 * /uniti/join/[token] — accept a staff invite.
 *
 * Requires a signed-in (verified) identity. Stashes the token and bounces to
 * sign-in if the visitor is not authenticated, so the link works even when the
 * teacher hasn't signed in yet (Phase-2 model: membership only against a
 * verified user).
 */
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) {
    throw redirect(307, `/uniti/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  return { token: params.token, email: locals.user.email };
};
