/**
 * Pairing — establishes the shared `houseRoomId` + encryption phrase
 * that bind N housemates' Yjs docs.
 *
 * Hearth is N-party, not 2-party. The room id is a 6-character
 * human-readable code (matches the `live-room` pattern: easy to read
 * over the kitchen table, easy to type) and is what the SignalRoom DO
 * sees as the URL slug. The encryption phrase is a separate, longer,
 * three-word phrase used to derive the AES-GCM key — keeping the room
 * id and key material separate means a casual room-code share doesn't
 * compromise wire confidentiality.
 *
 * Neither the room code nor the phrase ever leave the housemates'
 * devices. The signal relay sees ciphertext + the opaque room slug.
 */
const STORAGE_KEY = 'hearth-local:house';

export interface HousePairing {
  /** 6-char human-readable room code, e.g. "WARMOK". Used as the SignalRoom slug. */
  roomCode: string;
  /** Three-word encryption phrase, e.g. "WARM-KITCHEN-LOAF". Used for PBKDF2. */
  phrase: string;
  /** Stable id for THIS housemate. Different per device; each phone has its own. */
  memberId: string;
  /** Display name for THIS housemate, shown to the others. */
  memberName: string;
  /** Wall-clock ms when pairing was established. */
  pairedAt: number;
}

export function loadPairing(): HousePairing | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HousePairing;
  } catch {
    return null;
  }
}

export function savePairing(pairing: HousePairing): void {
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
 * Three-word phrase. Different vocabulary from the room code so the two
 * shouldn't be confused. Domestic warmth — kitchen and house words.
 */
const PHRASE_WORDS_A = [
  'WARM', 'SOFT', 'BRIGHT', 'QUIET', 'GENTLE', 'KIND', 'COSY', 'WORN',
] as const;
const PHRASE_WORDS_B = [
  'KITCHEN', 'KETTLE', 'HEARTH', 'PANTRY', 'TABLE', 'WINDOW', 'GARDEN', 'PORCH',
] as const;
const PHRASE_WORDS_C = [
  'LOAF', 'BUTTER', 'HONEY', 'TEA', 'JAM', 'STEW', 'SOUP', 'BREAD',
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
 * already an opaque 6-char token (not derived from any private value).
 * Hearth keeps the phrase secret on each device for AES-GCM.
 */
export function roomSlugFor(roomCode: string): string {
  return `hearth-${roomCode.toLowerCase()}`;
}

export const ROOM_CODE_REGEX = /^[A-Z2-9]{6}$/;
export const PHRASE_REGEX = /^[A-Z]+-[A-Z]+-[A-Z]+$/;
