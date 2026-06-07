/**
 * /uniti — the minimal office-manager flow (Phase 1A slice).
 *
 * Requires a signed-in Lucia user. Loads the school instance this user owns
 * (Phase-1A owner-email match — the same temporary shortcut documented in
 * resolve-instance.ts; Phase 2 swaps in verified identity + memberships).
 * Exposes `{ instance }` (or null) to the page.
 */
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const user = locals.user;
  if (!user) throw redirect(307, '/auth/login');

  const env = platform?.env;
  if (!env?.DB) return { instance: null };

  const db = getDrizzleClient(env.DB);
  // ⚠️ PHASE-1A-ONLY: owner-email match (see resolve-instance.ts).
  const row = await db
    .select({
      slug: schema.privateAppInstances.slug,
      name: schema.privateAppInstances.name,
      branding: schema.privateAppInstances.branding,
    })
    .from(schema.privateAppInstances)
    .where(eq(schema.privateAppInstances.ownerEmail, user.email.toLowerCase()))
    .limit(1);

  const instance = row[0] ?? null;
  return {
    instance: instance
      ? {
          slug: instance.slug,
          displayName: instance.branding?.displayName || instance.name,
        }
      : null,
  };
};
