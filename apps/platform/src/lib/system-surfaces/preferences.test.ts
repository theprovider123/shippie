import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  inQuietHours,
  loadPreferences,
  savePreferences,
  updatePreference,
} from './preferences';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('preferences', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('loads defaults when nothing is persisted', () => {
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it('survives corrupted JSON by falling back to defaults', () => {
    storage.setItem('shippie.system-prefs.v1', '{not json');
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it('save + load round-trip', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', largeText: true }, storage);
    const loaded = loadPreferences(storage);
    expect(loaded.theme).toBe('dark');
    expect(loaded.largeText).toBe(true);
  });

  it('updatePreference returns the merged preferences and persists them', () => {
    const next = updatePreference('reducedData', true, storage);
    expect(next.reducedData).toBe(true);
    expect(loadPreferences(storage).reducedData).toBe(true);
  });
});

describe('inQuietHours', () => {
  it('returns false when quiet hours are off', () => {
    expect(inQuietHours({ quietHoursStart: '', quietHoursEnd: '' }, '03:00')).toBe(false);
  });

  it('handles same-day windows', () => {
    expect(inQuietHours({ quietHoursStart: '09:00', quietHoursEnd: '17:00' }, '12:30')).toBe(true);
    expect(inQuietHours({ quietHoursStart: '09:00', quietHoursEnd: '17:00' }, '08:00')).toBe(false);
    expect(inQuietHours({ quietHoursStart: '09:00', quietHoursEnd: '17:00' }, '17:01')).toBe(false);
  });

  it('handles wrap-around windows', () => {
    expect(inQuietHours({ quietHoursStart: '22:00', quietHoursEnd: '07:00' }, '03:00')).toBe(true);
    expect(inQuietHours({ quietHoursStart: '22:00', quietHoursEnd: '07:00' }, '23:30')).toBe(true);
    expect(inQuietHours({ quietHoursStart: '22:00', quietHoursEnd: '07:00' }, '08:00')).toBe(false);
  });

  it('rejects malformed inputs by treating them as not-in-quiet-hours', () => {
    expect(inQuietHours({ quietHoursStart: 'lol', quietHoursEnd: '07:00' }, '03:00')).toBe(false);
  });
});
