/**
 * GET /api/apps/slug-check?slug=<slug>[&exclude=<current-slug>]
 *
 * Returns { available: boolean } — used by the maker identity editor to
 * validate a slug before submitting a rename. The optional `exclude`
 * parameter exempts the app's own current slug so the check stays green
 * while the maker types the same value back.
 */
import { json } from '@sveltejs/kit';
import { eq, and, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ available: false });

  const slug = event.url.searchParams.get('slug') ?? '';
  const exclude = event.url.searchParams.get('exclude') ?? '';

  if (!SLUG_RE.test(slug)) return json({ available: false });

  const db = getDrizzleClient(env.DB);
  const conditions = exclude
    ? and(eq(schema.apps.slug, slug), ne(schema.apps.slug, exclude))
    : eq(schema.apps.slug, slug);

  const [existing] = await db
    .select({ slug: schema.apps.slug })
    .from(schema.apps)
    .where(conditions)
    .limit(1);

  return json({ available: !existing });
};
