/**
 * seedOwnerAccess — give the office manager access to a freshly provisioned
 * school instance.
 *
 * Two paths:
 *  - the owner email already has a Shippie (Lucia) user → create a VERIFIED
 *    office_manager membership directly.
 *  - no user yet → mint a pending office_manager invite (token+expiry); the
 *    owner gets access on accept after they sign in.
 *
 * Either way the office manager never gets access from an unverified email
 * alone (the Phase-1A flaw) — they hold a membership only after a verified
 * identity exists.
 */
import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';
import { assignRole } from './memberships';
import { createInviteSystem, wireInviteStore } from './invites';

export interface SeedOwnerResult {
  via: 'membership' | 'invite';
  inviteToken?: string;
}

export async function seedOwnerAccess(args: {
  db: any;
  instanceId: string;
  ownerEmail: string;
  actorUserId: string | null;
  recordAudit?: Parameters<typeof createInviteSystem>[0]['recordAudit'];
}): Promise<SeedOwnerResult> {
  const { db, instanceId, ownerEmail, actorUserId } = args;
  const email = ownerEmail.trim().toLowerCase();

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing[0]) {
    await assignRole(db, instanceId, existing[0].id, 'office_manager', { invitedBy: actorUserId });
    return { via: 'membership' };
  }

  const invites = createInviteSystem({
    store: wireInviteStore(db),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    newToken: () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    recordAudit: args.recordAudit,
    actorUserId,
  });
  const invite = await invites.invite(instanceId, email, 'office_manager');
  return { via: 'invite', inviteToken: invite.token };
}
