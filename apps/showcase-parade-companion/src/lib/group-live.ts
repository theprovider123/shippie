import type { LngLat } from '../data/parade-2026';

export type GroupLivePacketKind = 'join' | 'presence';
export type GroupLiveStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'failed' | 'unsupported';

export interface GroupLivePacket {
  v: 1;
  kind: GroupLivePacketKind;
  source_id: string;
  display_name: string;
  supporter_tag: string;
  member_name: string;
  lng?: number;
  lat?: number;
  accuracy_m?: number;
  created_at: string;
  expires_at: string;
}

export interface GroupLiveMember extends LngLat {
  sourceId: string;
  displayName: string;
  supporterTag: string;
  memberName: string;
  joinedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  accuracyM: number | null;
  hasLocation: boolean;
}

export interface MakeGroupLivePacketInput {
  kind: GroupLivePacketKind;
  sourceId: string;
  displayName: string;
  supporterTag: string;
  memberName: string;
  point?: { lng: number; lat: number; accuracyM?: number | null } | null;
  now?: Date;
}

const GROUP_LIVE_TTL_MS = 8 * 60 * 60 * 1000;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const CRYPTO_LABEL = 'parade-companion:group-live:v1';

export function makeGroupLivePacket(input: MakeGroupLivePacketInput): GroupLivePacket {
  const now = input.now ?? new Date();
  const expires = new Date(now.getTime() + GROUP_LIVE_TTL_MS);
  const base: GroupLivePacket = {
    v: 1,
    kind: input.kind,
    source_id: input.sourceId,
    display_name: cleanText(input.displayName, 24) || 'Me',
    supporter_tag: cleanText(input.supporterTag.toUpperCase(), 8),
    member_name: cleanText(input.memberName, 40) || 'Me',
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  if (input.point) {
    base.lng = Number(input.point.lng.toFixed(6));
    base.lat = Number(input.point.lat.toFixed(6));
    base.accuracy_m = Math.max(1, Math.round(input.point.accuracyM ?? 999));
  }
  return base;
}

export function validateGroupLivePacket(input: unknown): GroupLivePacket | null {
  if (!isRecord(input) || input.v !== 1) return null;
  if (input.kind !== 'join' && input.kind !== 'presence') return null;
  if (!isText(input.source_id, 4, 80)) return null;
  if (!isText(input.display_name, 1, 32)) return null;
  if (!isText(input.member_name, 1, 48)) return null;
  if (typeof input.supporter_tag !== 'string' || input.supporter_tag.length > 12) return null;
  if (!validDate(input.created_at) || !validDate(input.expires_at)) return null;
  const out: GroupLivePacket = {
    v: 1,
    kind: input.kind,
    source_id: input.source_id,
    display_name: input.display_name,
    supporter_tag: input.supporter_tag,
    member_name: input.member_name,
    created_at: input.created_at,
    expires_at: input.expires_at,
  };
  if (typeof input.lng === 'number' && typeof input.lat === 'number') {
    if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) return null;
    out.lng = input.lng;
    out.lat = input.lat;
    out.accuracy_m = typeof input.accuracy_m === 'number' && Number.isFinite(input.accuracy_m)
      ? Math.round(input.accuracy_m)
      : 999;
  }
  return out;
}

export function mergeGroupLiveMembers(
  current: GroupLiveMember[],
  packet: GroupLivePacket,
  now = Date.now(),
): GroupLiveMember[] {
  if (!isPacketActive(packet, now)) return pruneGroupLiveMembers(current, now);
  const existing = current.find((member) => member.sourceId === packet.source_id);
  const createdMs = Date.parse(packet.created_at);
  const existingMs = existing ? Date.parse(existing.lastSeenAt) : -Infinity;
  if (existing && createdMs < existingMs) return pruneGroupLiveMembers(current, now);

  const nextMember: GroupLiveMember = {
    sourceId: packet.source_id,
    displayName: packet.display_name,
    supporterTag: packet.supporter_tag,
    memberName: packet.member_name,
    joinedAt: existing?.joinedAt ?? packet.created_at,
    lastSeenAt: packet.created_at,
    expiresAt: packet.expires_at,
    lng: typeof packet.lng === 'number' ? packet.lng : existing?.lng ?? 0,
    lat: typeof packet.lat === 'number' ? packet.lat : existing?.lat ?? 0,
    accuracyM: typeof packet.accuracy_m === 'number' ? packet.accuracy_m : existing?.accuracyM ?? null,
    hasLocation: typeof packet.lng === 'number' && typeof packet.lat === 'number' ? true : existing?.hasLocation ?? false,
  };

  const without = current.filter((member) => member.sourceId !== packet.source_id);
  return pruneGroupLiveMembers([nextMember, ...without], now);
}

export function pruneGroupLiveMembers(members: GroupLiveMember[], now = Date.now()): GroupLiveMember[] {
  return members
    .filter((member) => {
      const expires = Date.parse(member.expiresAt);
      return Number.isFinite(expires) && expires > now;
    })
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, 12);
}

export function groupLiveMembersForMap(
  members: GroupLiveMember[],
  localSourceId: string,
  now = Date.now(),
): GroupLiveMember[] {
  return pruneGroupLiveMembers(members, now)
    .filter((member) => member.sourceId !== localSourceId && member.hasLocation)
    .slice(0, 8);
}

export async function encodeGroupLivePayload(roomKey: string, packet: GroupLivePacket): Promise<string> {
  const key = await deriveAesKey(roomKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = TEXT_ENCODER.encode(JSON.stringify(packet));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const frame = new Uint8Array(iv.length + encrypted.length);
  frame.set(iv, 0);
  frame.set(encrypted, iv.length);
  return bytesToBase64Url(frame);
}

export async function decodeGroupLivePayload(roomKey: string, payload: string): Promise<GroupLivePacket | null> {
  try {
    const frame = base64UrlToBytes(payload);
    if (frame.length < 28) return null;
    const iv = frame.slice(0, 12);
    const encrypted = frame.slice(12);
    const key = await deriveAesKey(roomKey);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted));
    return validateGroupLivePacket(JSON.parse(TEXT_DECODER.decode(plain)));
  } catch {
    return null;
  }
}

export function buildGroupSignalUrl(roomId: string): string {
  const origin = signalOrigin();
  const url = new URL('/__shippie/signal/', origin);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(roomId)}`;
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  return url.toString();
}

function signalOrigin(): string {
  if (typeof window === 'undefined') return 'https://shippie.app';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    return 'https://shippie.app';
  }
  return window.location.origin;
}

function isPacketActive(packet: GroupLivePacket, now: number): boolean {
  const expires = Date.parse(packet.expires_at);
  return Number.isFinite(expires) && expires > now;
}

async function deriveAesKey(roomKey: string): Promise<CryptoKey> {
  const bytes = TEXT_ENCODER.encode(`${CRYPTO_LABEL}:${roomKey}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function cleanText(value: string, max: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
