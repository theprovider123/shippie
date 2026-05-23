import { decodeShareFragment, encodeShareFragment } from '@shippie/showcase-kit-v2';
import { CORRIDOR_EXTENT, type RoutePack } from '../data/parade-2026';
import { isInsideExtent } from './geo';

export const PLAN_SHARE_TYPE = 'parade.group-plan.v1';
export const MAX_PLAN_FRAGMENT_LENGTH = 2400;

export interface PlanPoint {
  label: string;
  lng: number;
  lat: number;
  time?: string;
}

export interface RelayRoomRef {
  roomId: string;
  roomKey: string;
  issuedAt: string;
}

export interface GroupPlan {
  v: 1;
  name: string;
  members: string[];
  primary: PlanPoint;
  fallback: PlanPoint;
  ifSeparated: string;
  leavePlan?: string;
  note?: string;
  updatedAt: string;
  room?: RelayRoomRef;
  roleHint?: 'join' | 'watch';
}

export function createDefaultGroupPlan(pack: RoutePack): GroupPlan {
  const primary = pack.meetingLandmarks[1] ?? pack.meetingLandmarks[0];
  const fallback = pack.meetingLandmarks[2] ?? primary;
  return {
    v: 1,
    name: 'Our parade group',
    members: [],
    primary: pointFromLandmark(primary, 'Primary meeting point', '13:00'),
    fallback: pointFromLandmark(fallback, 'Fallback meeting point', ':30'),
    ifSeparated: 'Meet at the fallback point on the next half hour. Do not push back through a dense crowd.',
    leavePlan: 'If stations are blocked, walk south toward Angel or use your agreed fallback route.',
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

export function createRelayRoomRef(): RelayRoomRef {
  return {
    roomId: `parade_${randomToken(18)}`,
    roomKey: randomToken(24),
    issuedAt: new Date().toISOString(),
  };
}

export function ensurePlanRoom(plan: GroupPlan): GroupPlan {
  if (isValidRoom(plan.room)) return plan;
  return { ...plan, room: createRelayRoomRef() };
}

export async function encodePlan(plan: GroupPlan): Promise<string> {
  const compact = compactPlan(plan);
  const fragment = await encodeShareFragment({ type: PLAN_SHARE_TYPE, payload: compact });
  if (fragment.length > MAX_PLAN_FRAGMENT_LENGTH) {
    throw new Error('Plan is too large for a reliable parade QR link.');
  }
  return fragment;
}

export async function decodePlan(fragment: string): Promise<GroupPlan | null> {
  if (!fragment || fragment.length > MAX_PLAN_FRAGMENT_LENGTH) return null;
  const decoded = await decodeShareFragment(stripHash(fragment));
  if (!decoded || !decoded.verify.valid || decoded.blob.type !== PLAN_SHARE_TYPE) return null;
  return validateGroupPlan(expandPlan(decoded.blob.payload));
}

export function validateGroupPlan(input: unknown): GroupPlan | null {
  if (!isRecord(input) || input.v !== 1) return null;
  if (!isNonEmpty(input.name)) return null;
  if (!Array.isArray(input.members)) return null;
  const members = input.members.filter((m): m is string => typeof m === 'string').slice(0, 12);
  const primary = validatePoint(input.primary);
  const fallback = validatePoint(input.fallback);
  if (!primary || !fallback) return null;
  if (!isNonEmpty(input.ifSeparated)) return null;
  return {
    v: 1,
    name: input.name.slice(0, 64),
    members: members.map((m) => m.slice(0, 32)),
    primary,
    fallback,
    ifSeparated: input.ifSeparated.slice(0, 240),
    leavePlan: typeof input.leavePlan === 'string' ? input.leavePlan.slice(0, 200) : '',
    note: typeof input.note === 'string' ? input.note.slice(0, 200) : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    room: isValidRoom(input.room) ? input.room : undefined,
    roleHint: input.roleHint === 'join' || input.roleHint === 'watch' ? input.roleHint : undefined,
  };
}

export function pointFromLandmark(
  landmark: { label?: string; name?: string; lng?: number; lat?: number } | undefined,
  fallbackLabel: string,
  time?: string,
): PlanPoint {
  return {
    label: landmark?.label ?? landmark?.name ?? fallbackLabel,
    lng: typeof landmark?.lng === 'number' ? landmark.lng : (CORRIDOR_EXTENT.west + CORRIDOR_EXTENT.east) / 2,
    lat: typeof landmark?.lat === 'number' ? landmark.lat : (CORRIDOR_EXTENT.south + CORRIDOR_EXTENT.north) / 2,
    time,
  };
}

function validatePoint(input: unknown): PlanPoint | null {
  if (!isRecord(input) || !isNonEmpty(input.label)) return null;
  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!isInsideExtent({ lng, lat })) return null;
  return {
    label: input.label.slice(0, 80),
    lng,
    lat,
    time: typeof input.time === 'string' ? input.time.slice(0, 16) : undefined,
  };
}

function compactPlan(plan: GroupPlan): Record<string, unknown> {
  return {
    v: 1,
    n: plan.name,
    m: plan.members,
    p: compactPoint(plan.primary),
    f: compactPoint(plan.fallback),
    s: plan.ifSeparated,
    l: plan.leavePlan ?? '',
    o: plan.note ?? '',
    u: plan.updatedAt,
    r: plan.room ? [plan.room.roomId, plan.room.roomKey, plan.room.issuedAt] : undefined,
    z: plan.roleHint ?? undefined,
  };
}

function expandPlan(input: unknown): unknown {
  if (!isRecord(input) || input.v !== 1 || !('n' in input)) return input;
  const room = Array.isArray(input.r) && input.r.length >= 3
    ? {
        roomId: String(input.r[0] ?? ''),
        roomKey: String(input.r[1] ?? ''),
        issuedAt: String(input.r[2] ?? ''),
      }
    : undefined;
  const roleHint = input.z === 'join' || input.z === 'watch' ? input.z : undefined;
  return {
    v: 1,
    name: input.n,
    members: input.m,
    primary: expandPoint(input.p),
    fallback: expandPoint(input.f),
    ifSeparated: input.s,
    leavePlan: input.l,
    note: input.o,
    updatedAt: input.u,
    room,
    roleHint,
  };
}

function compactPoint(point: PlanPoint): [string, number, number, string?] {
  return [
    point.label,
    Number(point.lng.toFixed(6)),
    Number(point.lat.toFixed(6)),
    point.time,
  ];
}

function expandPoint(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  return { label: input[0], lng: input[1], lat: input[2], time: input[3] };
}

function stripHash(fragment: string): string {
  return fragment.startsWith('#') ? fragment.slice(1) : fragment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidRoom(value: unknown): value is RelayRoomRef {
  if (!isRecord(value)) return false;
  return (
    typeof value.roomId === 'string' &&
    value.roomId.length >= 8 &&
    typeof value.roomKey === 'string' &&
    value.roomKey.length >= 12 &&
    typeof value.issuedAt === 'string' &&
    value.issuedAt.length >= 10
  );
}

function randomToken(length: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }
  return Math.random().toString(36).slice(2, 2 + length).padEnd(length, '0');
}
