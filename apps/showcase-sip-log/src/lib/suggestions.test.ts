import { describe, expect, test } from 'bun:test';
import { cutoffWarningFor, suggestionFor } from './suggestions';
import { DEFAULT_TARGETS, type Sip, type Targets } from '../db';

const T: Targets = { ...DEFAULT_TARGETS };

const at = (h: number, m = 0, day = '2026-05-01'): string => {
  return new Date(`${day}T${pad(h)}:${pad(m)}:00`).toISOString();
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const sip = (overrides: Partial<Sip> = {}): Sip => ({
  id: overrides.id ?? 's',
  kind: overrides.kind ?? 'water',
  ml: overrides.ml ?? 250,
  mg: overrides.mg ?? 0,
  logged_at: overrides.logged_at ?? at(8),
});

describe('suggestionFor', () => {
  test('morning + coffee before water → suggests water', () => {
    const now = new Date('2026-05-01T08:30:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'coffee-mug', ml: 240, mg: 95, logged_at: at(8) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).toBe('water-before-next-coffee');
    expect(out?.tone).toBe('info');
  });

  test('morning + water already logged → no morning suggestion', () => {
    const now = new Date('2026-05-01T08:30:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'water', ml: 250, logged_at: at(7) }),
      sip({ id: 'b', kind: 'coffee-mug', ml: 240, mg: 95, logged_at: at(8) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).not.toBe('water-before-next-coffee');
  });

  test('hits goal → "good" tone celebration', () => {
    const now = new Date('2026-05-01T16:00:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'water', ml: 2000, logged_at: at(15) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).toBe('goal-met');
    expect(out?.tone).toBe('good');
  });

  test('evening + 200ml short → evening pinch', () => {
    const now = new Date('2026-05-01T22:00:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'water', ml: 1800, logged_at: at(20) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).toBe('evening-pinch');
    expect(out?.text).toContain('200 ml short');
  });

  test('evening + far short → no nag (avoid scolding)', () => {
    const now = new Date('2026-05-01T22:00:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'water', ml: 200, logged_at: at(20) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).not.toBe('evening-pinch');
  });

  test('past cutoff + over caffeine cap → warn', () => {
    const now = new Date('2026-05-01T15:00:00');
    const sips: Sip[] = Array.from({ length: 5 }).map((_, i) =>
      sip({
        id: `c${i}`,
        kind: 'coffee-mug',
        ml: 240,
        mg: 100,
        logged_at: at(8 + i),
      }),
    );
    const out = suggestionFor({ sips, targets: T, now });
    expect(out?.id).toBe('caffeine-cap-after-cutoff');
    expect(out?.tone).toBe('warn');
  });

  test('returns null when nothing relevant applies', () => {
    const now = new Date('2026-05-01T13:00:00');
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'water', ml: 500, logged_at: at(8) }),
      sip({ id: 'b', kind: 'water', ml: 500, logged_at: at(11) }),
    ];
    const out = suggestionFor({ sips, targets: T, now });
    expect(out).toBeNull();
  });
});

describe('cutoffWarningFor', () => {
  test('water always returns null (no caffeine to warn about)', () => {
    const now = new Date('2026-05-01T18:00:00');
    expect(cutoffWarningFor('water', T, now)).toBeNull();
  });

  test('coffee before cutoff returns null', () => {
    const now = new Date('2026-05-01T10:00:00');
    expect(cutoffWarningFor('coffee-mug', T, now)).toBeNull();
  });

  test('coffee at or after cutoff returns a warning string', () => {
    const now = new Date('2026-05-01T14:00:00');
    const w = cutoffWarningFor('coffee-mug', T, now);
    expect(w).toContain('14:00');
    expect(w).toContain('decaf');
  });

  test('tea after cutoff also warns', () => {
    const now = new Date('2026-05-01T15:30:00');
    expect(cutoffWarningFor('tea', T, now)).not.toBeNull();
  });
});
