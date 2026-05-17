import { base64UrlToString, randomId, stringToBase64Url } from './crypto.ts';
import type { JoinToken, Space, SpaceCapsuleV0, SpaceParams, SpaceRoute } from './types.ts';

export const SPACE_CAPSULE_SCHEMA = 'shippie.space.capsule.v0' as const;

export function createSpace(input: {
  name: string;
  spaceId?: string;
  createdAt?: string | Date;
  hostRole?: string;
  memberRole?: string;
  maxClaims?: number;
  expiresAt?: string | Date;
}): { space: Space; hostToken: JoinToken; inviteToken: JoinToken } {
  const space: Space = {
    id: input.spaceId ?? randomId('space'),
    name: input.name,
    createdAt: dateString(input.createdAt ?? new Date()),
    status: 'active',
  };
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  return {
    space,
    hostToken: createJoinToken({
      spaceId: space.id,
      role: input.hostRole ?? 'owner',
      maxClaims: 1,
      expiresAt,
    }),
    inviteToken: createJoinToken({
      spaceId: space.id,
      role: input.memberRole ?? 'member',
      maxClaims: input.maxClaims ?? 20,
      expiresAt,
    }),
  };
}

export function createJoinToken(input: {
  spaceId: string;
  role: string;
  maxClaims?: number;
  expiresAt: string | Date;
  tokenId?: string;
}): JoinToken {
  return {
    tokenId: input.tokenId ?? randomId('join'),
    spaceId: input.spaceId,
    role: input.role,
    maxClaims: Math.max(1, Math.floor(input.maxClaims ?? 1)),
    claimCount: 0,
    expiresAt: dateString(input.expiresAt),
  };
}

export function rotateJoinToken(token: JoinToken, opts: { expiresAt?: string | Date; maxClaims?: number } = {}): JoinToken {
  return {
    tokenId: randomId('join'),
    spaceId: token.spaceId,
    role: token.role,
    maxClaims: Math.max(1, Math.floor(opts.maxClaims ?? token.maxClaims)),
    claimCount: 0,
    expiresAt: dateString(opts.expiresAt ?? token.expiresAt),
  };
}

export function archiveSpace<T extends { status: string; archivedAt?: string }>(space: T, archivedAt: string | Date = new Date()): T & { status: 'archived'; archivedAt: string } {
  return { ...space, status: 'archived', archivedAt: dateString(archivedAt) };
}

export function createSpaceCapsule(input: {
  spaceId: string;
  joinToken: string;
  role: string;
  appSlug?: string;
  packageHash?: string;
  maxClaims?: number;
  expiresAt?: string | Date;
  routes?: SpaceRoute[];
}): SpaceCapsuleV0 {
  return stripUndefined({
    schema: SPACE_CAPSULE_SCHEMA,
    spaceId: input.spaceId,
    joinToken: input.joinToken,
    appSlug: input.appSlug,
    packageHash: input.packageHash,
    role: input.role,
    maxClaims: input.maxClaims,
    expiresAt: input.expiresAt ? dateString(input.expiresAt) : undefined,
    routes: input.routes?.filter((route) => route.kind === 'cloud' || route.kind === 'hub' || route.kind === 'peer'),
  });
}

export function encodeSpaceCapsule(capsule: SpaceCapsuleV0): string {
  return stringToBase64Url(JSON.stringify(capsule));
}

export function decodeSpaceCapsule(value: string): SpaceCapsuleV0 {
  const parsed = JSON.parse(base64UrlToString(value)) as unknown;
  if (!isSpaceCapsule(parsed)) throw new Error('invalid Shippie space capsule');
  return parsed;
}

export function buildSpaceUrl(input: {
  baseUrl: string;
  appSlug?: string;
  spaceId: string;
  joinToken?: string;
  role?: string;
  secret?: string;
  capsule?: SpaceCapsuleV0;
  extraSearch?: Record<string, string | undefined>;
}): string {
  const url = new URL(input.baseUrl);
  if (input.appSlug) {
    url.pathname = `/run/${encodeURIComponent(input.appSlug)}/`;
  }
  url.searchParams.set('space', input.spaceId);
  if (input.joinToken) url.searchParams.set('join', input.joinToken);
  if (input.role) url.searchParams.set('role', input.role);
  for (const [key, value] of Object.entries(input.extraSearch ?? {})) {
    if (value != null && value !== '') url.searchParams.set(key, value);
  }
  const hash = new URLSearchParams();
  if (input.secret) hash.set('k', input.secret);
  if (input.capsule) hash.set('c', encodeSpaceCapsule(input.capsule));
  url.hash = hash.toString();
  return url.toString();
}

export function readSpaceParams(rawUrl: string): SpaceParams {
  const url = new URL(rawUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  let capsule: SpaceCapsuleV0 | null = null;
  const rawCapsule = hash.get('c');
  if (rawCapsule) {
    try {
      capsule = decodeSpaceCapsule(rawCapsule);
    } catch {
      capsule = null;
    }
  }
  return {
    spaceId: capsule?.spaceId ?? url.searchParams.get('space') ?? url.searchParams.get('room'),
    joinToken: capsule?.joinToken ?? url.searchParams.get('join'),
    role: capsule?.role ?? url.searchParams.get('role'),
    secret: hash.get('k'),
    appSlug: capsule?.appSlug ?? appSlugFromPath(url.pathname),
    capsule,
  };
}

export function isJoinTokenClaimable(token: JoinToken, now: string | Date = new Date()): boolean {
  if (token.revokedAt) return false;
  if (token.claimCount >= token.maxClaims) return false;
  return Date.parse(token.expiresAt) > dateMs(now);
}

function isSpaceCapsule(value: unknown): value is SpaceCapsuleV0 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema === SPACE_CAPSULE_SCHEMA &&
    typeof record.spaceId === 'string' &&
    typeof record.joinToken === 'string' &&
    typeof record.role === 'string'
  );
}

function appSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/\/run\/([^/]+)\/?/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function dateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}
