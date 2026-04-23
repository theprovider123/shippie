// apps/web/lib/access/invites.ts
import { and, eq, gt, isNull, isNotNull, sql as sqlOp } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';

function randomToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function createLinkInvite(input: {
  appId: string;
  createdBy: string;
  maxUses?: number;
  expiresAt?: Date;
}): Promise<{ id: string; token: string }> {
  const db = await getDb();
  const token = randomToken();
  const [row] = await db
    .insert(schema.appInvites)
    .values({
      appId: input.appId,
      createdBy: input.createdBy,
      token,
      kind: 'link',
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: schema.appInvites.id, token: schema.appInvites.token });
  return row!;
}

export async function claimInvite(input: {
  token: string;
  userId?: string;
}): Promise<
  | { success: true; appId: string; inviteId: string; anonymous: boolean; alreadyClaimed?: boolean }
  | { success: false; reason: 'not_found' | 'revoked_or_expired' | 'uses_exhausted' }
> {
  const db = await getDb();
  const [inv] = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.token, input.token))
    .limit(1);
  if (!inv) return { success: false, reason: 'not_found' };
  if (inv.revokedAt) return { success: false, reason: 'revoked_or_expired' };
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now())
    return { success: false, reason: 'revoked_or_expired' };

  // Idempotency: if this signed-in user already has active access, short-circuit
  // without burning a use or creating a duplicate access row.
  if (input.userId) {
    const [existing] = await db
      .select({ id: schema.appAccess.id })
      .from(schema.appAccess)
      .where(
        and(
          eq(schema.appAccess.appId, inv.appId),
          eq(schema.appAccess.userId, input.userId),
          isNull(schema.appAccess.revokedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return { success: true, appId: inv.appId, inviteId: inv.id, anonymous: false, alreadyClaimed: true };
    }
  }

  if (inv.maxUses != null && inv.usedCount >= inv.maxUses)
    return { success: false, reason: 'uses_exhausted' };

  await db
    .update(schema.appInvites)
    .set({ usedCount: sqlOp`${schema.appInvites.usedCount} + 1` })
    .where(eq(schema.appInvites.id, inv.id));

  if (input.userId) {
    await db
      .insert(schema.appAccess)
      .values({
        appId: inv.appId,
        userId: input.userId,
        invitedBy: inv.createdBy,
        source: 'invite_link',
      })
      .onConflictDoNothing({ target: [schema.appAccess.appId, schema.appAccess.userId] });
    return { success: true, appId: inv.appId, inviteId: inv.id, anonymous: false };
  }
  return { success: true, appId: inv.appId, inviteId: inv.id, anonymous: true };
}

export async function revokeInvite(input: {
  id: string;
  appId: string;
  by: string;
}): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.appInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.appInvites.id, input.id), eq(schema.appInvites.appId, input.appId)),
    )
    .returning({ id: schema.appInvites.id });
  return rows.length > 0;
}

export async function listInvites(input: { appId: string }) {
  const db = await getDb();
  return db
    .select()
    .from(schema.appInvites)
    .where(and(eq(schema.appInvites.appId, input.appId), isNull(schema.appInvites.revokedAt)))
    .orderBy(schema.appInvites.createdAt);
}
