/**
 * /new — public quick-ship page.
 *
 * Anonymous visitors can run the 60-second trial path. Signed-in makers
 * keep the slugged deploy + dashboard workflow.
 */
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
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

  // Update mode — /new?slug=<owned app> preseeds the slug so "upload a
  // new version" is one click from the maker surfaces. Only honoured for
  // apps the signed-in user owns; otherwise it's just the blank form.
  const updateSlug = url.searchParams.get('slug')?.trim() || null;
  let update: { slug: string; name: string } | null = null;
  if (updateSlug && locals.user && platform?.env.DB && !remixSlug) {
    const db = getDrizzleClient(platform.env.DB);
    const [owned] = await db
      .select({ slug: schema.apps.slug, name: schema.apps.name, makerId: schema.apps.makerId })
      .from(schema.apps)
      .where(eq(schema.apps.slug, updateSlug))
      .limit(1);
    if (owned && owned.makerId === locals.user.id) {
      update = { slug: owned.slug, name: owned.name };
    }
  }

  return {
    user: locals.user ? { email: locals.user.email } : null,
    installationId: url.searchParams.get('installation_id'),
    remix,
    update,
  };
};
