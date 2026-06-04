/**
 * Per-app dashboard layout — verifies ownership + loads app overview.
 */
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: LayoutServerLoad = async ({ locals, platform, params, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  if (!platform?.env.DB) throw error(500, 'database unavailable');

  const db = getDrizzleClient(platform.env.DB);
  const [app] = await db
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.slug, params.slug))
    .limit(1);
  if (!app) throw error(404, 'app not found');
  if (app.makerId !== locals.user.id) throw error(403, 'forbidden');

  return { app };
};
