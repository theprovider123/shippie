import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { getDrizzleClient, schema } from '$server/db/client';

export interface AppSpaceSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  archiveReason: string | null;
  latestToken: {
    id: string;
    role: string;
    inviteId: string;
    inviteToken: string;
    maxClaims: number | null;
    claimCount: number;
    inviteMaxUses: number | null;
    inviteUsedCount: number;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  } | null;
  tokenCount: number;
  activeTokenCount: number;
  totalClaimCount: number;
  totalInviteUsedCount: number;
}

export interface AppSpaceMetrics {
  totalSpaces: number;
  activeSpaces: number;
  archivedSpaces: number;
  totalJoinLinks: number;
  activeJoinLinks: number;
  totalClaims: number;
  totalInviteUses: number;
}

export interface SpaceListRow {
  spaceId: string;
  name: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  archiveReason: string | null;
  joinTokenId: string | null;
  role: string | null;
  inviteId: string | null;
  maxClaims: number | null;
  claimCount: number | null;
  tokenExpiresAt: string | null;
  tokenRevokedAt: string | null;
  tokenCreatedAt: string | null;
  inviteToken: string | null;
  inviteMaxUses: number | null;
  inviteUsedCount: number | null;
  inviteRevokedAt: string | null;
}

export async function ensureSpaceForApp(input: {
  db: D1Database;
  spaceId: string;
  appId: string;
  appSlug: string;
  createdBy: string;
  name?: string | null;
  packageHash?: string | null;
}): Promise<void> {
  const db = getDrizzleClient(input.db);
  const now = new Date().toISOString();
  const [existingSpace] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, input.spaceId))
    .limit(1);

  if (!existingSpace) {
    await db.insert(schema.spaces).values({
      id: input.spaceId,
      name: input.name?.trim() || `${input.appSlug} private space`,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await recordSpaceAudit(input.db, {
      spaceId: input.spaceId,
      appId: input.appId,
      actorId: input.createdBy,
      action: 'space.created',
      metadata: { appSlug: input.appSlug },
    });
  }

  const [existingLink] = await db
    .select({ id: schema.spaceApps.id })
    .from(schema.spaceApps)
    .where(and(eq(schema.spaceApps.spaceId, input.spaceId), eq(schema.spaceApps.appId, input.appId)))
    .limit(1);
  if (!existingLink) {
    await db.insert(schema.spaceApps).values({
      spaceId: input.spaceId,
      appId: input.appId,
      appSlug: input.appSlug,
      packageHash: input.packageHash ?? null,
    });
    await recordSpaceAudit(input.db, {
      spaceId: input.spaceId,
      appId: input.appId,
      actorId: input.createdBy,
      action: 'space.app_linked',
      metadata: { appSlug: input.appSlug, packageHash: input.packageHash ?? null },
    });
  }
}

export async function recordSpaceJoinToken(input: {
  db: D1Database;
  spaceId: string;
  appId: string;
  inviteId: string;
  joinToken: string;
  role: string;
  maxClaims?: number | null;
  expiresAt?: string | null;
  createdBy: string;
  rotatedFrom?: string | null;
}): Promise<void> {
  const db = getDrizzleClient(input.db);
  const [existing] = await db
    .select({ id: schema.spaceJoinTokens.id })
    .from(schema.spaceJoinTokens)
    .where(eq(schema.spaceJoinTokens.id, input.joinToken))
    .limit(1);
  if (existing) return;

  await db.insert(schema.spaceJoinTokens).values({
    id: input.joinToken,
    spaceId: input.spaceId,
    appId: input.appId,
    inviteId: input.inviteId,
    role: input.role,
    maxClaims: input.maxClaims ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy,
    rotatedFrom: input.rotatedFrom ?? null,
  });
  await recordSpaceAudit(input.db, {
    spaceId: input.spaceId,
    appId: input.appId,
    actorId: input.createdBy,
    action: input.rotatedFrom ? 'space.join_token_rotated' : 'space.join_token_created',
    metadata: {
      joinToken: input.joinToken,
      role: input.role,
      maxClaims: input.maxClaims ?? null,
      inviteId: input.inviteId,
      rotatedFrom: input.rotatedFrom ?? null,
    },
  });
}

export async function incrementSpaceJoinTokenClaim(input: {
  db: D1Database;
  spaceId: string;
  joinToken: string;
  inviteId: string;
  appId: string;
  actorId?: string | null;
}): Promise<void> {
  const db = getDrizzleClient(input.db);
  const [updated] = await db
    .update(schema.spaceJoinTokens)
    .set({ claimCount: sql`${schema.spaceJoinTokens.claimCount} + 1` })
    .where(
      and(
        eq(schema.spaceJoinTokens.id, input.joinToken),
        eq(schema.spaceJoinTokens.spaceId, input.spaceId),
        eq(schema.spaceJoinTokens.inviteId, input.inviteId),
      ),
    )
    .returning({ id: schema.spaceJoinTokens.id });
  if (!updated) return;
  await recordSpaceAudit(input.db, {
    spaceId: input.spaceId,
    appId: input.appId,
    actorId: input.actorId ?? null,
    action: 'space.join_token_claimed',
    metadata: { joinToken: input.joinToken, inviteId: input.inviteId },
  });
}

export async function listSpacesForApp(appId: string, d1: D1Database): Promise<AppSpaceSummary[]> {
  const db = getDrizzleClient(d1);
  const rows = await db
    .select({
      spaceId: schema.spaces.id,
      name: schema.spaces.name,
      status: schema.spaces.status,
      createdAt: schema.spaces.createdAt,
      archivedAt: schema.spaces.archivedAt,
      archiveReason: schema.spaces.archiveReason,
      joinTokenId: schema.spaceJoinTokens.id,
      role: schema.spaceJoinTokens.role,
      inviteId: schema.spaceJoinTokens.inviteId,
      maxClaims: schema.spaceJoinTokens.maxClaims,
      claimCount: schema.spaceJoinTokens.claimCount,
      tokenExpiresAt: schema.spaceJoinTokens.expiresAt,
      tokenRevokedAt: schema.spaceJoinTokens.revokedAt,
      tokenCreatedAt: schema.spaceJoinTokens.createdAt,
      inviteToken: schema.appInvites.token,
      inviteMaxUses: schema.appInvites.maxUses,
      inviteUsedCount: schema.appInvites.usedCount,
      inviteRevokedAt: schema.appInvites.revokedAt,
    })
    .from(schema.spaceApps)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceApps.spaceId))
    .leftJoin(
      schema.spaceJoinTokens,
      and(eq(schema.spaceJoinTokens.spaceId, schema.spaces.id), eq(schema.spaceJoinTokens.appId, appId)),
    )
    .leftJoin(schema.appInvites, eq(schema.appInvites.id, schema.spaceJoinTokens.inviteId))
    .where(eq(schema.spaceApps.appId, appId))
    .orderBy(desc(schema.spaces.createdAt), desc(schema.spaceJoinTokens.createdAt));

  return summariseSpaceRows(rows);
}

export function summariseSpaceRows(rows: SpaceListRow[], nowMs = Date.now()): AppSpaceSummary[] {
  const bySpace = new Map<string, AppSpaceSummary>();
  for (const row of rows) {
    let summary = bySpace.get(row.spaceId);
    if (!summary) {
      summary = {
        id: row.spaceId,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
        archivedAt: row.archivedAt,
        archiveReason: row.archiveReason,
        latestToken: null,
        tokenCount: 0,
        activeTokenCount: 0,
        totalClaimCount: 0,
        totalInviteUsedCount: 0,
      };
      bySpace.set(row.spaceId, summary);
    }
    if (!row.joinTokenId) continue;
    summary.tokenCount += 1;
    summary.totalClaimCount += row.claimCount ?? 0;
    summary.totalInviteUsedCount += row.inviteUsedCount ?? 0;
    const active =
      row.tokenRevokedAt == null &&
      row.inviteRevokedAt == null &&
      (!row.tokenExpiresAt || Date.parse(row.tokenExpiresAt) > nowMs);
    if (active) summary.activeTokenCount += 1;
    if (!summary.latestToken) {
      summary.latestToken = {
        id: row.joinTokenId,
        role: row.role ?? 'member',
        inviteId: row.inviteId ?? '',
        inviteToken: row.inviteToken ?? '',
        maxClaims: row.maxClaims,
        claimCount: row.claimCount ?? 0,
        inviteMaxUses: row.inviteMaxUses,
        inviteUsedCount: row.inviteUsedCount ?? 0,
        expiresAt: row.tokenExpiresAt,
        revokedAt: row.tokenRevokedAt ?? row.inviteRevokedAt,
        createdAt: row.tokenCreatedAt ?? row.createdAt,
      };
    }
  }
  return Array.from(bySpace.values());
}

export function summariseSpaceMetrics(spaces: AppSpaceSummary[]): AppSpaceMetrics {
  return spaces.reduce<AppSpaceMetrics>(
    (metrics, space) => {
      metrics.totalSpaces += 1;
      if (space.status === 'archived') metrics.archivedSpaces += 1;
      else metrics.activeSpaces += 1;
      metrics.totalJoinLinks += space.tokenCount;
      metrics.activeJoinLinks += space.activeTokenCount;
      metrics.totalClaims += space.totalClaimCount;
      metrics.totalInviteUses += space.totalInviteUsedCount;
      return metrics;
    },
    {
      totalSpaces: 0,
      activeSpaces: 0,
      archivedSpaces: 0,
      totalJoinLinks: 0,
      activeJoinLinks: 0,
      totalClaims: 0,
      totalInviteUses: 0,
    },
  );
}

export async function archiveSpaceForApp(input: {
  db: D1Database;
  appId: string;
  spaceId: string;
  actorId: string;
  reason?: string | null;
}): Promise<boolean> {
  const db = getDrizzleClient(input.db);
  const [link] = await db
    .select({ id: schema.spaceApps.id })
    .from(schema.spaceApps)
    .where(and(eq(schema.spaceApps.appId, input.appId), eq(schema.spaceApps.spaceId, input.spaceId)))
    .limit(1);
  if (!link) return false;

  const now = new Date().toISOString();
  const rows = await db
    .update(schema.spaces)
    .set({
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
      archiveReason: input.reason ?? null,
    })
    .where(and(eq(schema.spaces.id, input.spaceId), isNull(schema.spaces.archivedAt)))
    .returning({ id: schema.spaces.id });
  if (rows.length === 0) return false;

  await recordSpaceAudit(input.db, {
    spaceId: input.spaceId,
    appId: input.appId,
    actorId: input.actorId,
    action: 'space.archived',
    metadata: { reason: input.reason ?? null },
  });
  return true;
}

async function recordSpaceAudit(
  d1: D1Database,
  input: {
    spaceId: string;
    appId?: string | null;
    actorId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const db = getDrizzleClient(d1);
  await db.insert(schema.spaceAuditLog).values({
    spaceId: input.spaceId,
    appId: input.appId ?? null,
    actorId: input.actorId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  });
}
