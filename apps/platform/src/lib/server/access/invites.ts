/**
 * App invites — D1 port of apps/web/lib/access/invites.ts.
 *
 * Operates directly on `event.platform.env.DB` via Drizzle so we can be
 * called from any route handler. The legacy KV-backed short-link layer
 * is collapsed to use platform.env.CACHE for the `i:{code}` lookup
 * (resolved by the Phase 4a `routes/i/[code]/` endpoint).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { getDrizzleClient, schema } from '../db/client';

export interface CreateLinkInviteInput {
  appId: string;
  createdBy: string;
  maxUses?: number;
  expiresAt?: string | null;
  db: D1Database;
}

export async function createLinkInvite(input: CreateLinkInviteInput): Promise<{ id: string; token: string }> {
  const db = getDrizzleClient(input.db);
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
  if (!row) throw new Error('insert_failed');
  return row;
}

export interface RevokeInviteInput {
  id: string;
  appId: string;
  by: string;
  db: D1Database;
}

export async function revokeInvite(input: RevokeInviteInput): Promise<boolean> {
  const db = getDrizzleClient(input.db);
  const rows = await db
    .update(schema.appInvites)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(schema.appInvites.id, input.id), eq(schema.appInvites.appId, input.appId)))
    .returning({ id: schema.appInvites.id });
  return rows.length > 0;
}

export async function listInvites(appId: string, db: D1Database) {
  const drizzle = getDrizzleClient(db);
  return drizzle
    .select()
    .from(schema.appInvites)
    .where(and(eq(schema.appInvites.appId, appId), isNull(schema.appInvites.revokedAt)))
    .orderBy(schema.appInvites.createdAt);
}

/**
 * Mint a short code that maps to a long invite token in KV. The Phase 4a
 * /i/[code] route resolves it back. Returns the short code (no URL).
 */
const SHORT_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const SHORT_KV_PREFIX = 'i:';

export async function createShortLink(input: {
  token: string;
  expiresAt?: string | null;
  kv: KVNamespace;
}): Promise<{ code: string }> {
  const ttlSec = input.expiresAt
    ? Math.max(60, Math.floor((new Date(input.expiresAt).getTime() - Date.now()) / 1000))
    : 60 * 60 * 24 * 30;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateShortCode();
    const existing = await input.kv.get(`${SHORT_KV_PREFIX}${code}`);
    if (existing) continue;
    await input.kv.put(`${SHORT_KV_PREFIX}${code}`, input.token, { expirationTtl: ttlSec });
    return { code };
  }
  // Statistically improbable. Fall through.
  const code = generateShortCode();
  await input.kv.put(`${SHORT_KV_PREFIX}${code}`, input.token, { expirationTtl: ttlSec });
  return { code };
}

function generateShortCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_ALPHABET[bytes[i]! % SHORT_ALPHABET.length];
  }
  return out;
}

function randomToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Quiets the unused-import warning when KV not actually used in this module. */
export const __invitesSqlMarker = sql;
