/**
 * Laptop side of a handoff (the receiver). Auth-guarded; the actual offer
 * is created client-side so the recipient private key never leaves the
 * device. `?app=<slug>` optionally scopes the handoff to one app.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const appParam = url.searchParams.get('app');
  return { appSlug: appParam && SLUG_RE.test(appParam) ? appParam : null };
};
