/**
 * Profile loader for the maker dashboard. Wraps readAppProfile from
 * the deploy KV with ownership enforcement.
 *
 * Throws (via redirect) if the caller isn't authenticated or doesn't
 * own the slug. Server components import this directly.
 */
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { schema } from '@shippie/db';
import type { AppProfile } from '@shippie/analyse';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { readAppProfile } from '@/lib/deploy/kv';

export async function requireMakerOwnsApp(slug: string): Promise<{ userId: string; appId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?return_to=/dashboard/${slug}/enhancements`);
  }
  const db = await getDb();
  const rows = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  const app = rows[0];
  if (!app || app.makerId !== session.user.id) {
    redirect('/dashboard/apps');
  }
  return { userId: session.user.id, appId: app.id };
}

export interface LoadedProfile {
  /** Present when the deploy pipeline has produced a profile for this slug. */
  profile: AppProfile | null;
}

export async function loadAppProfileForOwner(slug: string): Promise<LoadedProfile> {
  await requireMakerOwnsApp(slug);
  const raw = await readAppProfile(slug);
  return { profile: (raw as AppProfile | null) ?? null };
}
