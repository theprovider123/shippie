import { afterEach, describe, expect, it } from 'vitest';
import { PREFIXES, SUFFIXES, generateHandle, getAnonKey, getHandle, shortHandle } from './handle';

afterEach(() => localStorage.clear());

describe('handle system', () => {
  it('generates from the pools only', () => {
    for (let i = 0; i < 50; i++) {
      const h = generateHandle();
      const pre = PREFIXES.find((p) => h.startsWith(p));
      expect(pre).toBeDefined();
      expect(SUFFIXES).toContain(h.slice(pre!.length));
    }
  });

  it('never exceeds 19 characters (longest prefix + longest suffix)', () => {
    const longest = Math.max(...PREFIXES.map((p) => p.length)) + Math.max(...SUFFIXES.map((s) => s.length));
    expect(longest).toBeLessThanOrEqual(19);
    expect(generateHandle(() => 0.999).length).toBeLessThanOrEqual(longest);
  });

  it('mints once and persists', () => {
    const first = getHandle();
    expect(getHandle()).toBe(first);
    expect(localStorage.getItem('cannon_handle')).toBe(first);
  });

  it('anon key is stable and UUID-shaped', () => {
    const k = getAnonKey();
    expect(getAnonKey()).toBe(k);
    expect(k).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('truncates long handles for the compose chip', () => {
    expect(shortHandle('NorthBankNelson')).toBe('NorthBankNe…');
    expect(shortHandle('TheGunCole')).toBe('TheGunCole');
  });
});
