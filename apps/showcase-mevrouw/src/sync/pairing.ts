/**
 * Pairing — establishes the shared `couple_id` that binds the two
 * devices' Yjs docs.
 *
 * In production this hands off to Shippie's OAuth coordinator + the
 * SignalRoom DO. For local dev, the pairing token is just a code the
 * two devices share — entered on each device, persisted to local
 * storage, and used to derive the room key.
 *
 * The pairing token is NEVER sent to any server. It exists only on
 * the two paired phones. The signal relay sees an opaque hash
 * derived from it (the room id), nothing more.
 */
const STORAGE_KEY = 'mevrouw-local:pairing';

export interface Pairing {
  /** Human-readable couple code, e.g. "TENDER-CRANE-3849". Generated on first device, entered on second. */
  coupleCode: string;
  /** Stable id for THIS device. Different per device; each phone has its own. */
  deviceId: string;
  /** Wall-clock ms when pairing was established. */
  pairedAt: number;
}

export function loadPairing(): Pairing | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pairing;
  } catch {
    return null;
  }
}

export function savePairing(pairing: Pairing): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pairing));
}

export function clearPairing(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const ADJECTIVES = [
  'TENDER', 'GOLDEN', 'SOFT', 'WARM', 'BRIGHT', 'GENTLE', 'QUIET', 'KIND',
] as const;
const NOUNS = [
  'CRANE', 'WILLOW', 'EMBER', 'TIDE', 'MEADOW', 'COTTON', 'HONEY', 'LANTERN',
] as const;

export function generateCoupleCode(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${n}-${num}`;
}

export function generateDeviceId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}-${rand}`;
}

/**
 * The room id is what the signal relay sees. It's a one-way hash of
 * the couple code so two phones with the same code agree on the room
 * but the relay can't reverse-derive the human-readable code.
 *
 * Production: replace with a proper SubtleCrypto digest.
 */
export function roomIdFor(coupleCode: string): string {
  let h = 5381;
  for (let i = 0; i < coupleCode.length; i++) {
    h = ((h << 5) + h) ^ coupleCode.charCodeAt(i);
  }
  return `mevrouw-${(h >>> 0).toString(36)}`;
}
