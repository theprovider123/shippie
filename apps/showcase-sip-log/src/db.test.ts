import { describe, expect, test } from 'bun:test';
import { dayKey, PRESETS, pruneOld, todayKey, type Sip } from './db';

describe('sip-log db helpers', () => {
  test('PRESETS covers water + coffee + tea with sane defaults', () => {
    expect(PRESETS.water.ml).toBe(250);
    expect(PRESETS.water.mg).toBe(0);
    expect(PRESETS.coffee.mg).toBeGreaterThan(0);
    expect(PRESETS.tea.mg).toBeGreaterThan(0);
    expect(PRESETS.tea.mg).toBeLessThan(PRESETS.coffee.mg);
  });

  test('todayKey is YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('dayKey extracts the date portion of an ISO timestamp', () => {
    expect(dayKey('2026-05-01T13:42:09.000Z')).toBe('2026-05-01');
  });

  test('pruneOld drops sips older than 30 days', () => {
    const recent: Sip = {
      id: 'a',
      kind: 'water',
      ml: 250,
      mg: 0,
      logged_at: new Date().toISOString(),
    };
    const ancient: Sip = {
      id: 'b',
      kind: 'coffee',
      ml: 240,
      mg: 64,
      logged_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const out = pruneOld([recent, ancient]);
    expect(out.map((s) => s.id)).toEqual(['a']);
  });
});
