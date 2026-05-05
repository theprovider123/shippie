import { eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';

export type TrialClaimResult =
  | { claimed: true; slug: string }
  | { claimed: false; reason: 'missing' | 'already_claimed' | 'expired' | 'not_trial' };

export async function claimTrialAppForMaker(input: {
  db: ShippieDb;
  slug: string;
  makerId: string;
  now?: Date;
}): Promise<TrialClaimResult> {
  const claimTrialSlug = input.slug.trim();
  if (!claimTrialSlug) return { claimed: false, reason: 'missing' };

  const [trialApp] = await input.db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      isTrial: schema.apps.isTrial,
      trialUntil: schema.apps.trialUntil,
      trialClaimedBy: schema.apps.trialClaimedBy,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, claimTrialSlug))
    .limit(1);

  if (!trialApp) return { claimed: false, reason: 'missing' };
  if (!trialApp.isTrial) return { claimed: false, reason: 'not_trial' };
  if (trialApp.trialClaimedBy) return { claimed: false, reason: 'already_claimed' };
  if (trialApp.trialUntil && trialApp.trialUntil <= (input.now ?? new Date()).toISOString()) {
    return { claimed: false, reason: 'expired' };
  }

  await input.db
    .update(schema.apps)
    .set({
      makerId: input.makerId,
      isTrial: false,
      trialClaimedBy: input.makerId,
      trialIpHash: null,
      updatedAt: (input.now ?? new Date()).toISOString(),
    })
    .where(eq(schema.apps.id, trialApp.id));

  return { claimed: true, slug: trialApp.slug };
}
