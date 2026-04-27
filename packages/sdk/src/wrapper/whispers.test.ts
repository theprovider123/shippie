import { describe, expect, test } from 'bun:test';
import {
  buildWhisper,
  expiresAfterMs,
  shouldShowWhisper,
  readWhisperFromManifest,
} from './whispers.ts';

describe('buildWhisper — validation', () => {
  test('rejects non-object input', () => {
    expect(buildWhisper(null)).toBeNull();
    expect(buildWhisper('string')).toBeNull();
    expect(buildWhisper(42)).toBeNull();
  });
  test('rejects missing id', () => {
    expect(buildWhisper({ message: 'hi' })).toBeNull();
  });
  test('rejects bad id', () => {
    expect(buildWhisper({ id: 'has space', message: 'hi' })).toBeNull();
    expect(buildWhisper({ id: '-leadingdash', message: 'hi' })).toBeNull();
  });
  test('rejects missing message', () => {
    expect(buildWhisper({ id: 'a', message: '' })).toBeNull();
  });
  test('rejects message too long', () => {
    expect(buildWhisper({ id: 'a', message: 'x'.repeat(500) })).toBeNull();
  });
  test('accepts a clean declaration', () => {
    const w = buildWhisper({
      id: 'filter-launch',
      message: 'Filtering by cooking time is live!',
      action: '/search',
      showOnce: true,
      expiresAfter: '7d',
    });
    expect(w?.id).toBe('filter-launch');
    expect(w?.action).toBe('/search');
    expect(w?.showOnce).toBe(true);
    expect(w?.expiresAfter).toBe('7d');
  });
});

describe('buildWhisper — sanitization', () => {
  test('strips bad action route (concrete id)', () => {
    const w = buildWhisper({ id: 'a', message: 'hi', action: '/recipes/carbonara' });
    expect(w?.action).toBeUndefined();
  });
  test('keeps placeholder action route', () => {
    const w = buildWhisper({ id: 'a', message: 'hi', action: '/recipes/:id' });
    expect(w?.action).toBe('/recipes/:id');
  });
  test('drops malformed expiresAfter', () => {
    const w = buildWhisper({ id: 'a', message: 'hi', expiresAfter: '7days' });
    expect(w?.expiresAfter).toBeUndefined();
  });
});

describe('expiresAfterMs', () => {
  test('parses days, hours, minutes', () => {
    expect(expiresAfterMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(expiresAfterMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(expiresAfterMs('30m')).toBe(30 * 60 * 1000);
  });
  test('returns null on bad input', () => {
    expect(expiresAfterMs('forever')).toBeNull();
    expect(expiresAfterMs('7days')).toBeNull();
  });
});

describe('shouldShowWhisper', () => {
  const w = {
    id: 'a',
    message: 'm',
    showOnce: true,
    expiresAfter: '7d',
  } as const;

  test('shows when never dismissed', () => {
    expect(shouldShowWhisper(w, { dismissed: {} }, '2026-04-27T10:00:00Z')).toBe(true);
  });

  test('hides when recently dismissed', () => {
    expect(
      shouldShowWhisper(
        w,
        { dismissed: { a: '2026-04-26T10:00:00Z' } },
        '2026-04-27T10:00:00Z',
      ),
    ).toBe(false);
  });

  test('re-shows after expiresAfter passes', () => {
    expect(
      shouldShowWhisper(
        w,
        { dismissed: { a: '2026-04-01T10:00:00Z' } },
        '2026-04-27T10:00:00Z',
      ),
    ).toBe(true);
  });

  test('showOnce without expiry never re-shows once dismissed', () => {
    const noExpiry = { id: 'a', message: 'm', showOnce: true };
    expect(
      shouldShowWhisper(
        noExpiry,
        { dismissed: { a: '2024-01-01T00:00:00Z' } },
        '2026-04-27T10:00:00Z',
      ),
    ).toBe(false);
  });

  test('showOnce=false rep-shows after window', () => {
    const sticky = { id: 'a', message: 'm', showOnce: false, expiresAfter: '1d' };
    expect(
      shouldShowWhisper(
        sticky,
        { dismissed: { a: '2026-04-25T10:00:00Z' } },
        '2026-04-27T10:00:00Z',
      ),
    ).toBe(true);
  });
});

describe('readWhisperFromManifest', () => {
  test('returns null for null manifest', () => {
    expect(readWhisperFromManifest(null)).toBeNull();
    expect(readWhisperFromManifest(undefined)).toBeNull();
  });
  test('returns null when manifest has no whisper', () => {
    expect(readWhisperFromManifest({})).toBeNull();
  });
  test('returns parsed Whisper when present', () => {
    const w = readWhisperFromManifest({
      whisper: { id: 'a', message: 'hi' },
    });
    expect(w?.id).toBe('a');
  });
});
