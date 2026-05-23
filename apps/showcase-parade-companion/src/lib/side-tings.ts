/**
 * Side tings — other groups you watch on your map without appearing in.
 *
 * - Storage is a local list (localStorage), capped at MAX_SIDE_TINGS.
 * - Each row carries the relay roomId + roomKey (decryption-only in v1; the
 *   client simply never offers a "publish to side ting" affordance).
 * - `chipForGroupName` returns a deterministic 2-letter mono-caps chip used to
 *   distinguish up to five gold dots on the map without inventing new hues.
 *
 * No dependency on shippie-db — keeping this module self-contained so codex
 * can wire it in without a schema change for parade day.
 */

export interface SideTing {
  roomId: string;
  roomKey: string;
  name: string;
  memberCount: number;
  addedAt: string;
  lastSeenAt?: string;
  primary?: {
    label: string;
    lng: number;
    lat: number;
    time?: string;
  };
  fallback?: {
    label: string;
    lng: number;
    lat: number;
  };
}

export const MAX_SIDE_TINGS = 5;

const STORAGE_KEY = 'parade-companion:side-tings';

export function listSideTings(): SideTing[] {
  return readRows();
}

export function hasSideTing(roomId: string): boolean {
  return readRows().some((row) => row.roomId === roomId);
}

export type AddSideTingResult =
  | { ok: true; sideTing: SideTing }
  | { ok: false; reason: 'duplicate' | 'cap' };

export function addSideTing(input: Omit<SideTing, 'addedAt'>): AddSideTingResult {
  const current = readRows();
  if (current.some((row) => row.roomId === input.roomId)) {
    return { ok: false, reason: 'duplicate' };
  }
  if (current.length >= MAX_SIDE_TINGS) {
    return { ok: false, reason: 'cap' };
  }
  const sideTing: SideTing = { ...input, addedAt: new Date().toISOString() };
  writeRows([sideTing, ...current]);
  return { ok: true, sideTing };
}

export function removeSideTing(roomId: string): void {
  writeRows(readRows().filter((row) => row.roomId !== roomId));
}

export function touchSideTing(roomId: string, lastSeenAt: string): void {
  const rows = readRows();
  let changed = false;
  const next = rows.map((row) => {
    if (row.roomId !== roomId) return row;
    changed = true;
    return { ...row, lastSeenAt };
  });
  if (changed) writeRows(next);
}

/**
 * Two-letter mono-caps chip. Picks first letter + the next available
 * consonant for legibility; falls back to first + second character.
 * Two letters keep the dot label scannable at zoom 1.
 */
export function chipForGroupName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleaned.length === 0) return '··';
  if (cleaned.length === 1) return `${cleaned[0]}·`;
  const first = cleaned[0]!;
  const consonants = /[BCDFGHJKLMNPQRSTVWXYZ]/;
  for (let i = 1; i < cleaned.length; i += 1) {
    if (consonants.test(cleaned[i]!)) return `${first}${cleaned[i]}`;
  }
  return `${first}${cleaned[1]}`;
}

function readRows(): SideTing[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidSideTing) : [];
  } catch {
    return [];
  }
}

function writeRows(rows: SideTing[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function isValidSideTing(value: unknown): value is SideTing {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.roomId === 'string' &&
    typeof row.roomKey === 'string' &&
    typeof row.name === 'string' &&
    typeof row.memberCount === 'number' &&
    typeof row.addedAt === 'string'
  );
}
