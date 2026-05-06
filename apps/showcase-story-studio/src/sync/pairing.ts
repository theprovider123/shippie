/**
 * Pairing — the parent runs this once per grandparent. The output is
 * a `FamilyPairing` blob the parent's device persists, plus the
 * matching record on the grandparent's device.
 *
 * Why an address-book of pairings instead of one global couple-code:
 * the same family often has two grandparents on two different phones,
 * sometimes in two different countries, sometimes only one of them
 * uses Shippie. Each gets their own pair, each uses their own room.
 * Up to two paired grandparents per the spec — multiple are allowed,
 * the parent UI doesn't actually cap them.
 *
 * The kid never sees this screen. The parent does the pairing once.
 */
const STORAGE_KEY = 'story-studio:pairings';
const SETTINGS_KEY = 'story-studio:settings';

export interface FamilyPairing {
  /** Stable id for this pairing record. */
  id: string;
  /** Parent-set label of the grandparent ("Granny", "Grandad"). */
  label: string;
  /** Shared secret typed on both phones. Uppercase, hyphenated. */
  familyCode: string;
  /** Wall-clock ms when pairing was established. */
  pairedAt: number;
}

export interface StudioSettings {
  /** Display name of the kid ("Lily"). Set once in settings. */
  kidName: string;
  /** Stable id for this device — different per phone. */
  deviceId: string;
}

export function loadPairings(): FamilyPairing[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FamilyPairing[]) : [];
  } catch {
    return [];
  }
}

export function savePairings(pairings: FamilyPairing[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pairings));
}

export function addPairing(pairing: FamilyPairing): FamilyPairing[] {
  const list = loadPairings();
  // Dedup by id; if a code is re-typed, replace.
  const filtered = list.filter((p) => p.id !== pairing.id);
  filtered.push(pairing);
  savePairings(filtered);
  return filtered;
}

export function removePairing(id: string): FamilyPairing[] {
  const next = loadPairings().filter((p) => p.id !== id);
  savePairings(next);
  return next;
}

export function loadSettings(): StudioSettings {
  if (typeof localStorage === 'undefined') {
    return { kidName: 'My kid', deviceId: generateDeviceId() };
  }
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StudioSettings;
      if (parsed.kidName && parsed.deviceId) return parsed;
    } catch {
      /* fallthrough */
    }
  }
  const fresh: StudioSettings = { kidName: 'My kid', deviceId: generateDeviceId() };
  saveSettings(fresh);
  return fresh;
}

export function saveSettings(settings: StudioSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const ADJECTIVES = [
  'WARM', 'GOLDEN', 'BRIGHT', 'KIND', 'SOFT', 'GENTLE', 'HONEY', 'COSY',
] as const;
const NOUNS = [
  'LANTERN', 'MEADOW', 'CRAYON', 'KITE', 'STORY', 'EMBER', 'SPARROW', 'COTTAGE',
] as const;

export function generateFamilyCode(): string {
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

export function generatePairingId(): string {
  return `pair_${generateDeviceId()}`;
}

/** Hash the family code into a relay room id — same one-way hash as Mevrouw. */
export function roomIdFor(familyCode: string): string {
  let h = 5381;
  for (let i = 0; i < familyCode.length; i++) {
    h = ((h << 5) + h) ^ familyCode.charCodeAt(i);
  }
  return `story-studio-${(h >>> 0).toString(36)}`;
}

export const FAMILY_CODE_PATTERN = /^[A-Z]+-[A-Z]+-\d{4}$/;
