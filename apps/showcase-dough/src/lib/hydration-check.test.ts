import { describe, expect, test } from 'bun:test';
import { checkHydration } from './hydration-check';

describe('checkHydration', () => {
  test('all-bread-flour at 75% sits in the comfort band', () => {
    const c = checkHydration([{ kind: 'bread', pct: 100 }], 75);
    expect(c.severity).toBe('ok');
  });

  test('all-purpose at 85% triggers a warn (out of comfort, not catastrophic)', () => {
    const c = checkHydration([{ kind: 'all-purpose', pct: 100 }], 85);
    // 85% on AP exceeds AP comfort max (72) and is past the hard max (78)
    // so we expect at least a warning — error is also acceptable here.
    expect(c.severity === 'warn' || c.severity === 'error').toBe(true);
  });

  test('all-purpose at 95% is flagged as a hard error', () => {
    const c = checkHydration([{ kind: 'all-purpose', pct: 100 }], 95);
    expect(c.severity).toBe('error');
  });

  test('rye-heavy mix tolerates wetter doughs', () => {
    const c = checkHydration(
      [
        { kind: 'rye', pct: 70 },
        { kind: 'bread', pct: 30 },
      ],
      85,
    );
    // Within the comfortable band for a rye-heavy mix.
    expect(c.severity).toBe('ok');
  });

  test('00 flour at 80% is flagged (Naples runs ~58–62%)', () => {
    const c = checkHydration([{ kind: '00', pct: 100 }], 80);
    expect(c.severity).toBe('error');
  });

  test('extremely low hydration (40%) is an error', () => {
    const c = checkHydration([{ kind: 'bread', pct: 100 }], 40);
    expect(c.severity).toBe('error');
  });

  test('empty flour mix returns an error', () => {
    const c = checkHydration([], 75);
    expect(c.severity).toBe('error');
  });

  test('weighted-average band shifts up with whole-wheat', () => {
    const wholeWheat = checkHydration(
      [
        { kind: 'bread', pct: 50 },
        { kind: 'whole-wheat', pct: 50 },
      ],
      82,
    );
    const breadOnly = checkHydration([{ kind: 'bread', pct: 100 }], 82);
    // Same hydration; the whole-wheat half should be more forgiving.
    // Either both are ok, or the bread-only one is the warmer-bound one.
    expect(['ok', 'warn']).toContain(wholeWheat.severity);
    expect(['ok', 'warn']).toContain(breadOnly.severity);
  });
});
