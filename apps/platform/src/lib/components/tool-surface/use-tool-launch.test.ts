import { describe, expect, test } from 'vitest';
import {
  isPlainActivation,
  resolveHardFallbackTarget,
  prefetchTargets,
  HARD_LAUNCH_FALLBACK_MS,
} from './use-tool-launch';

describe('isPlainActivation — only a plain left-click triggers the SPA fallback', () => {
  test('no event (keyboard/programmatic) counts as plain', () => {
    expect(isPlainActivation(undefined)).toBe(true);
    expect(isPlainActivation(null)).toBe(true);
  });

  test('plain left-click is plain', () => {
    expect(isPlainActivation({ button: 0 })).toBe(true);
    expect(isPlainActivation({})).toBe(true);
  });

  test('middle / right click is not plain', () => {
    expect(isPlainActivation({ button: 1 })).toBe(false);
    expect(isPlainActivation({ button: 2 })).toBe(false);
  });

  test('any modifier key makes it not plain (open-in-new-tab etc.)', () => {
    expect(isPlainActivation({ metaKey: true })).toBe(false);
    expect(isPlainActivation({ ctrlKey: true })).toBe(false);
    expect(isPlainActivation({ altKey: true })).toBe(false);
    expect(isPlainActivation({ shiftKey: true })).toBe(false);
  });
});

describe('resolveHardFallbackTarget — absolute target, or null when no nav needed', () => {
  test('returns absolute target for a relative launch href', () => {
    expect(resolveHardFallbackTarget('/run/cycle', 'https://shippie.app/dock')).toBe(
      'https://shippie.app/run/cycle',
    );
  });

  test('returns null when the resolved target equals the current url', () => {
    expect(
      resolveHardFallbackTarget('/dock', 'https://shippie.app/dock'),
    ).toBeNull();
  });

  test('returns null for an unusable launch href', () => {
    expect(resolveHardFallbackTarget('', '')).toBeNull();
    expect(resolveHardFallbackTarget('http://[bad', 'https://shippie.app/dock')).toBeNull();
  });
});

describe('prefetchTargets — what to warm before launch', () => {
  test('launch intent warms both the route and the embed frame', () => {
    expect(prefetchTargets('cycle', '/run/cycle', true)).toEqual([
      '/run/cycle',
      '/__shippie-run/cycle/?shippie_embed=1',
    ]);
  });

  test('details intent warms only the route', () => {
    expect(prefetchTargets('cycle', '/apps/cycle', false)).toEqual(['/apps/cycle']);
  });

  test('slug is url-encoded in the embed target', () => {
    expect(prefetchTargets('a b', '/run/a%20b', true)[1]).toBe(
      '/__shippie-run/a%20b/?shippie_embed=1',
    );
  });
});

test('HARD_LAUNCH_FALLBACK_MS preserves the existing 900ms timing', () => {
  expect(HARD_LAUNCH_FALLBACK_MS).toBe(900);
});
