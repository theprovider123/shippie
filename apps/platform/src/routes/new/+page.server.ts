/**
 * /new — public quick-ship page.
 *
 * Anonymous visitors can run the 60-second trial path. Signed-in makers
 * keep the slugged deploy + dashboard workflow.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { remixEligibilityForSlug } from '$server/remix/eligibility';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  const remixSlug = url.searchParams.get('remix')?.trim() || null;
  let remix: Awaited<ReturnType<typeof remixEligibilityForSlug>> | null = null;

  if (remixSlug) {
    remix = platform?.env.DB
      ? await remixEligibilityForSlug(getDrizzleClient(platform.env.DB), remixSlug)
      : { ok: false, reason: 'Database binding unavailable.' };
  }

  return {
    user: locals.user ? { email: locals.user.email } : null,
    installationId: url.searchParams.get('installation_id'),
    remix,
  };
};
