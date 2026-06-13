/**
 * Phone side of a handoff — opened by scanning the laptop's QR. Loads the
 * pending offer (recipient public key + the app to continue) for the
 * signed-in account so the page can package + encrypt the local snapshot.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isHandoffId, readHandoffOffer } from '$server/handoff/handoff-relay';

export const load: PageServerLoad = async ({ locals, platform, params, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  const id = params.id;
  if (!platform?.env?.CACHE || !isHandoffId(id)) {
    return { id, offer: null as null };
  }
  const offer = await readHandoffOffer(platform.env, locals.user.id, id);
  return {
    id,
    offer: offer
      ? {
          recipientPublicKey: offer.recipientPublicKey,
          appSlug: offer.appSlug ?? null,
          deviceLabel: offer.deviceLabel ?? null,
        }
      : null,
  };
};
