import { describe, expect, test } from 'bun:test';
import { checkSalt } from './salt-check';

describe('checkSalt', () => {
  test('2% is the textbook ok', () => {
    expect(checkSalt(2.0).severity).toBe('ok');
  });

  test('1.8% and 2.2% bracket the comfort band', () => {
    expect(checkSalt(1.8).severity).toBe('ok');
    expect(checkSalt(2.2).severity).toBe('ok');
  });

  test('1.6% is on the low side (warn) but not an error', () => {
    expect(checkSalt(1.6).severity).toBe('ok');
  });

  test('1.3% triggers warn (low, fine for enriched)', () => {
    expect(checkSalt(1.3).severity).toBe('warn');
  });

  test('2.5% is a warn (high but not error)', () => {
    expect(checkSalt(2.5).severity).toBe('warn');
  });

  test('0.5% is a hard error — sluggish / tasteless', () => {
    expect(checkSalt(0.5).severity).toBe('error');
  });

  test('3.5% is a hard error — sluggish ferment, sharp finish', () => {
    expect(checkSalt(3.5).severity).toBe('error');
  });

  test('every result carries a baker-readable message', () => {
    for (const v of [0.5, 1.3, 1.8, 2.0, 2.5, 3.5]) {
      const r = checkSalt(v);
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
});
