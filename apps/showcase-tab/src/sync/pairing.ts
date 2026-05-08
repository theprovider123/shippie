/**
 * Pairing — establishes the shared room code + encryption phrase that
 * bind the N phones at the table.
 *
 * Tab is N-party. The room code is a 6-character human-readable code
 * (matches the Live Room and Hearth pattern: easy to read out loud
 * across a noisy restaurant table). The encryption phrase is a
 * separate, longer, three-word phrase used to derive the AES-GCM key.
 *
 * Neither the room code nor the phrase ever leave the diners' devices.
 * The signal relay sees ciphertext + the opaque room slug.
 */
const STORAGE_KEY = 'tab-local:pairing';

export interface TabPairing {
  /** 6-char human-readable room code, e.g. "WARMOK". Used as the SignalRoom slug. */
  roomCode: string;
  /** Three-word encryption phrase, e.g. "FRESH-OLIVE-BREAD". Used for PBKDF2. */
  phrase: string;
  /** Stable id for THIS diner. Different per device; each phone has its own. */
  memberId: string;
  /** Display name for THIS diner, shown to the others. */
  memberName: string;
  /** Wall-clock ms when pairing was established. */
  pairedAt: number;
}

export function loadPairing(): TabPairing | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TabPairing;
  } catch {
    return null;
  }
}

export function savePairing(pairing: TabPairing): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pairing));
}

export function clearPairing(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a 6-character room code. Excludes 0/O/1/I to reduce typos. */
export function generateRoomCode(): string {
  let out = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ROOM_CHARS[b % ROOM_CHARS.length];
  return out;
}

/**
 * Three-word phrase. Different vocabulary from the room code so the
 * two shouldn't be confused. Table-talk words — food, table, drink.
 */
const PHRASE_WORDS_A = [
  'FRESH', 'WARM', 'CRISP', 'RIPE', 'SHARP', 'SWEET', 'SALTY', 'SMOKY',
] as const;
const PHRASE_WORDS_B = [
  'OLIVE', 'TABLE', 'PLATE', 'GLASS', 'CANDLE', 'LINEN', 'KITCHEN', 'NIGHT',
] as const;
const PHRASE_WORDS_C = [
  'BREAD', 'WINE', 'WATER', 'SALT', 'PEPPER', 'CHEESE', 'LEMON', 'HONEY',
] as const;

export function generatePhrase(): string {
  const a = PHRASE_WORDS_A[Math.floor(Math.random() * PHRASE_WORDS_A.length)];
  const b = PHRASE_WORDS_B[Math.floor(Math.random() * PHRASE_WORDS_B.length)];
  const c = PHRASE_WORDS_C[Math.floor(Math.random() * PHRASE_WORDS_C.length)];
  return `${a}-${b}-${c}`;
}

export function generateMemberId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}-${rand}`;
}

/**
 * The signal relay sees the room code directly as its slug — it's
 * already an opaque 6-char token. Tab keeps the phrase secret on each
 * device for AES-GCM.
 */
export function roomSlugFor(roomCode: string): string {
  return `tab-${roomCode.toLowerCase()}`;
}

export const ROOM_CODE_REGEX = /^[A-Z2-9]{6}$/;
export const PHRASE_REGEX = /^[A-Z]+-[A-Z]+-[A-Z]+$/;
