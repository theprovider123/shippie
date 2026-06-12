/**
 * The Cannon — shared validation + helpers for the /api/cannon/* routes.
 *
 * Identity is the app-issued anonymous key (golazo playerKey idiom): the
 * showcase generates a UUID + a terrace handle client-side and sends both
 * with writes. The server never sees a platform session.
 */

export const CANNON_PREFIXES = [
  'NorthBank',
  'ClockEnd',
  'Highbury',
  'TheGun',
  'Emirates',
  'Ashburton',
  'Islington',
  'Arsenal',
] as const;

export const CANNON_SUFFIXES = [
  'Nelson',
  'Cyrus',
  'Charlie',
  'Henry',
  'Adams',
  'Bergkamp',
  'Vieira',
  'Pires',
  'Lauren',
  'Cole',
] as const;

export const THREADS = new Set(['MATCH', 'ANALYSIS', 'HISTORY']);
export const MOODS = new Set(['buzzing', 'relieved', 'anxious', 'frustrated']);
export const PICKS = new Set(['W', 'D', 'L']);
export const REPORT_REASONS = new Set(['abuse', 'spam', 'off-topic', 'other']);

export const MAX_TEXT = 280;
export const LIST_LIMIT = 50;
export const COMPOSE_COOLDOWN_MS = 30_000;
/** Distinct anonymous reporters needed before a take auto-hides pending review. */
export const REPORT_HIDE_THRESHOLD = 3;

/**
 * Server-side language gate for an anonymous public feed. Deliberately short:
 * slurs and direct-harm phrases only — banter and swearing-at-the-ref
 * territory stays a community matter (downvotes dim, reports hide).
 */
const BLOCKED_TERMS = [
  'nigger', 'nigga', 'faggot', 'tranny', 'paki', 'spastic', 'retard',
  'kill yourself', 'kys', 'rape',
];
const BLOCKED_RE = new RegExp(`(?:^|[^a-z])(?:${BLOCKED_TERMS.join('|')})(?:[^a-z]|$)`, 'i');

export function containsBlockedTerm(text: string): boolean {
  return BLOCKED_RE.test(text);
}

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

/** Handle must be exactly one pool prefix + one pool suffix. */
export function isValidHandle(handle: unknown): handle is string {
  if (typeof handle !== 'string') return false;
  return CANNON_PREFIXES.some(
    (pre) =>
      handle.startsWith(pre) &&
      (CANNON_SUFFIXES as readonly string[]).includes(handle.slice(pre.length)),
  );
}

/** App-issued anonymous key — UUID-shaped, never a session token. */
export function isValidAnonKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(key);
}

export function isValidMatchId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id);
}

export interface TakeRow {
  id: string;
  handle: string;
  thread: string;
  text: string;
  match_id?: string | null;
  up: number;
  down: number;
  created_at: number;
}

export function publicTake(row: TakeRow, myVote: 'up' | 'down' | null = null) {
  return {
    id: row.id,
    handle: row.handle,
    thread: row.thread,
    text: row.text,
    matchId: row.match_id ?? null,
    up: row.up,
    down: row.down,
    createdAt: row.created_at,
    myVote,
  };
}
