import { describe, expect, test } from 'bun:test';
import { dailySessionHash } from './session-hash.ts';

describe('dailySessionHash — invariants', () => {
  test('returns 64-char hex string', async () => {
    const h = await dailySessionHash('device-1', '2026-04-27', 'app-salt-recipe');
    expect(/^[a-f0-9]{64}$/.test(h)).toBe(true);
  });

  test('deterministic — same inputs always yield same hash', async () => {
    const a = await dailySessionHash('device-1', '2026-04-27', 'app-salt-recipe');
    const b = await dailySessionHash('device-1', '2026-04-27', 'app-salt-recipe');
    expect(a).toBe(b);
  });

  test('cross-day uncorrelatable — date in input changes hash', async () => {
    const today = await dailySessionHash('device-1', '2026-04-27', 'app-salt-recipe');
    const tomorrow = await dailySessionHash('device-1', '2026-04-28', 'app-salt-recipe');
    expect(today).not.toBe(tomorrow);
  });

  test('cross-app uncorrelatable — appSalt changes hash', async () => {
    const recipes = await dailySessionHash('device-1', '2026-04-27', 'app-salt-recipe');
    const budget = await dailySessionHash('device-1', '2026-04-27', 'app-salt-budget');
    expect(recipes).not.toBe(budget);
  });

  test('different devices yield different hashes (same day, same app)', async () => {
    const a = await dailySessionHash('device-A', '2026-04-27', 'salt');
    const b = await dailySessionHash('device-B', '2026-04-27', 'salt');
    expect(a).not.toBe(b);
  });
});

describe('dailySessionHash — input validation', () => {
  test('rejects empty deviceId', async () => {
    let caught: Error | null = null;
    try {
      await dailySessionHash('', '2026-04-27', 'salt');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain('deviceId');
  });

  test('rejects malformed date', async () => {
    let caught: Error | null = null;
    try {
      await dailySessionHash('d', '04/27/2026', 'salt');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain('YYYY-MM-DD');
  });

  test('rejects empty salt', async () => {
    let caught: Error | null = null;
    try {
      await dailySessionHash('d', '2026-04-27', '');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain('appSalt');
  });
});
