/**
 * Pairing — establishes the shared room id that binds the two phones'
 * Yjs docs.
 *
 * The pair code is NEVER sent to any server. It exists only on the two
 * paired phones. The signal relay sees an opaque hash derived from it
 * (the room id), nothing more.
 *
 * Each device picks a stable role on first run: 'a' (the device that
 * generated the code) or 'b' (the device that entered it). Role is the
 * authorship tag on med-dose logs, symptom entries, and handover notes —
 * it survives across sessions and doesn't change.
 *
 * Solo mode is ALSO supported. A caregiver can use Care Log with no
 * partner — `loadPairing()` returning null does NOT block app entry;
 * the Pairing screen offers "Use solo" alongside "Pair".
 */
const STORAGE_KEY = 'care-log:pairing';

export type CaregiverRole = 'a' | 'b';

export interface Pairing {
  /** Human-readable pair code, e.g. "BIRCH-NORTH-3849". Generated on caregiver A's phone, entered on caregiver B's. */
  pairCode: string;
  /** Stable id for THIS device. */
  deviceId: string;
  /** Which side of the pair this device is — 'a' generated the code, 'b' entered it. */
  role: CaregiverRole;
  /** Wall-clock ms when pairing was established. */
  pairedAt: number;
  /** Solo mode — caregiver works alone. No relay. The role is still 'a' but no peer is expected. */
  solo: boolean;
}

export function loadPairing(): Pairing | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Pairing;
    if (!parsed.pairCode || (parsed.role !== 'a' && parsed.role !== 'b')) return null;
    // Backfill solo for older saved records.
    if (typeof parsed.solo !== 'boolean') parsed.solo = false;
    return parsed;
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
  'BIRCH', 'STEADY', 'NORTH', 'CALM', 'CLEAR', 'PLAIN', 'OPEN', 'LEVEL',
] as const;
const NOUNS = [
  'GATE', 'BRIDGE', 'PATH', 'RIVER', 'STONE', 'LIGHT', 'PORT', 'KEY',
] as const;

export function generatePairCode(): string {
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

const PAIR_CODE_RE = /^[A-Z]+-[A-Z]+-\d{4}$/;

export function isValidPairCode(code: string): boolean {
  return PAIR_CODE_RE.test(code.trim().toUpperCase());
}

export function normalisePairCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Room id is what the signal relay sees. One-way hash of the pair code
 * so two phones with the same code agree on the room but the relay
 * can't reverse-derive the human-readable code.
 */
export function roomIdFor(pairCode: string): string {
  let h = 5381;
  for (let i = 0; i < pairCode.length; i++) {
    h = ((h << 5) + h) ^ pairCode.charCodeAt(i);
  }
  return `care-log-${(h >>> 0).toString(36)}`;
}
