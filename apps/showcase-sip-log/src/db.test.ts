import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_TARGETS,
  PRESETS,
  dayKey,
  pruneOld,
  removeSip,
  todayKey,
  updateSip,
  type Sip,
} from './db';

const sip = (overrides: Partial<Sip> = {}): Sip => ({
  id: overrides.id ?? 's_test',
  kind: overrides.kind ?? 'water',
  ml: overrides.ml ?? 250,
  mg: overrides.mg ?? 0,
  logged_at: overrides.logged_at ?? new Date().toISOString(),
  ...(overrides.note ? { note: overrides.note } : {}),
});

describe('sip-log db helpers', () => {
  test('PRESETS covers water + espresso + mug + tea with sane defaults', () => {
    expect(PRESETS.water.ml).toBe(250);
    expect(PRESETS.water.mg).toBe(0);
    expect(PRESETS['coffee-espresso'].mg).toBeGreaterThan(0);
    expect(PRESETS['coffee-mug'].mg).toBeGreaterThan(PRESETS['coffee-espresso'].mg / 2);
    expect(PRESETS.tea.mg).toBeGreaterThan(0);
    expect(PRESETS.tea.mg).toBeLessThan(PRESETS['coffee-mug'].mg);
  });

  test('DEFAULT_TARGETS are documented sensible defaults', () => {
    expect(DEFAULT_TARGETS.water_ml).toBe(2000);
    expect(DEFAULT_TARGETS.caffeine_cutoff_hour).toBe(14);
    expect(DEFAULT_TARGETS.caffeine_max_mg).toBe(400);
  });

  test('todayKey is YYYY-MM-DD in local time', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const fixed = new Date(2026, 4, 1, 12, 0, 0); // 2026-05-01 local
    expect(todayKey(fixed)).toBe('2026-05-01');
  });

  test('dayKey extracts the date portion of an ISO timestamp in local time', () => {
    const local = new Date(2026, 4, 1, 13, 42, 9, 0).toISOString();
    expect(dayKey(local)).toBe('2026-05-01');
  });

  test('pruneOld drops sips older than 90 days', () => {
    const recent = sip({ id: 'a', logged_at: new Date().toISOString() });
    const ancient = sip({
      id: 'b',
      kind: 'coffee-mug',
      ml: 240,
      mg: 95,
      logged_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const out = pruneOld([recent, ancient]);
    expect(out.map((s) => s.id)).toEqual(['a']);
  });

  test('updateSip patches a single row by id, leaves others alone', () => {
    const a = sip({ id: 'a', ml: 250 });
    const b = sip({ id: 'b', ml: 250 });
    const out = updateSip([a, b], 'b', { ml: 500 });
    expect(out.find((s) => s.id === 'a')?.ml).toBe(250);
    expect(out.find((s) => s.id === 'b')?.ml).toBe(500);
  });

  test('removeSip drops the matching id', () => {
    const a = sip({ id: 'a' });
    const b = sip({ id: 'b' });
    const out = removeSip([a, b], 'a');
    expect(out.map((s) => s.id)).toEqual(['b']);
  });
});
