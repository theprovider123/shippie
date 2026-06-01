/**
 * /new — public quick-ship page.
 *
 * Anonymous visitors can run the 60-second trial path. Signed-in makers
 * keep the slugged deploy + dashboard workflow.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';
import { remixHandoffForSlug } from '$server/remix/handoff';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  const remixSlug = url.searchParams.get('remix')?.trim() || null;
  let remix: Awaited<ReturnType<typeof remixHandoffForSlug>> | null = null;

  if (remixSlug) {
    remix = platform?.env.DB
      ? await remixHandoffForSlug(getDrizzleClient(platform.env.DB), remixSlug, {
          reservedSlugs: await loadReservedSlugs(platform.env.DB),
        })
      : { ok: false, reason: 'Database binding unavailable.' };
  }

  return {
    user: locals.user ? { email: locals.user.email } : null,
    installationId: url.searchParams.get('installation_id'),
    remix,
  };
};
