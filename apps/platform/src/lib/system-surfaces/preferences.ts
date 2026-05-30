/**
 * System Surfaces — user preferences.
 *
 * Tranche 2. On-device prefs surfaced through the Settings shell at
 * `/__shippie/settings/`. Every preference is opt-in and persists in
 * localStorage on the user's device. Shippie does not sync these to
 * any server.
 */

export interface SystemPreferences {
  theme: 'auto' | 'light' | 'dark';
  motion: 'auto' | 'reduce';
  largeText: boolean;
  hapticsEnabled: boolean;
  reducedData: boolean;
  /** Quiet hours start/end in HH:MM, both inclusive. Empty when off. */
  quietHoursStart: string;
  quietHoursEnd: string;
}

const KEY = 'shippie.system-prefs.v1';

export const DEFAULT_PREFERENCES: SystemPreferences = Object.freeze({
  theme: 'auto',
  motion: 'auto',
  largeText: false,
  hapticsEnabled: true,
  reducedData: false,
  quietHoursStart: '',
  quietHoursEnd: '',
});

function safeParse(raw: string | null): Partial<SystemPreferences> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Partial<SystemPreferences>;
  } catch {
    /* fall through to default */
  }
  return {};
}

export function loadPreferences(storage: Storage = globalThis.localStorage): SystemPreferences {
  if (!storage) return { ...DEFAULT_PREFERENCES };
  return { ...DEFAULT_PREFERENCES, ...safeParse(storage.getItem(KEY)) };
}

export function savePreferences(
  prefs: SystemPreferences,
  storage: Storage = globalThis.localStorage,
): void {
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify(prefs));
}

export function updatePreference<K extends keyof SystemPreferences>(
  key: K,
  value: SystemPreferences[K],
  storage: Storage = globalThis.localStorage,
): SystemPreferences {
  const next = { ...loadPreferences(storage), [key]: value };
  savePreferences(next, storage);
  return next;
}

/**
 * Check whether the given clock time falls inside the user's quiet
 * hours. Supports wrap-around windows (e.g. 22:00 → 07:00).
 */
export function inQuietHours(prefs: Pick<SystemPreferences, 'quietHoursStart' | 'quietHoursEnd'>, hhmm: string): boolean {
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (!start || !end) return false;
  if (start === end) return true;
  const cur = parseHhmm(hhmm);
  const s = parseHhmm(start);
  const e = parseHhmm(end);
  if (cur === null || s === null || e === null) return false;
  if (s < e) {
    return cur >= s && cur <= e;
  }
  // wrap-around (e.g. 22:00 → 07:00)
  return cur >= s || cur <= e;
}

function parseHhmm(s: string): number | null {
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]!);
  const mins = Number(m[2]!);
  if (h > 23) return null;
  return h * 60 + mins;
}
