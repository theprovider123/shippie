import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { haptic } from './haptics.ts';

let calls: unknown[] = [];

const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  calls = [];
  (globalThis as { navigator?: unknown }).navigator = {
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern);
      return true;
    },
  };
  (globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: false }),
  };
});

afterAll(() => {
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('haptic', () => {
  test('tap → short buzz', () => {
    haptic('tap');
    expect(calls).toEqual([10]);
  });
  test('success → two short', () => {
    haptic('success');
    expect(calls).toEqual([[10, 40, 10]]);
  });
  test('warn → medium buzz', () => {
    haptic('warn');
    expect(calls).toEqual([[20, 60, 20]]);
  });
  test('error → long + short', () => {
    haptic('error');
    expect(calls).toEqual([[40, 30, 10]]);
  });
  test('no-ops when prefers-reduced-motion is set', () => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: () => ({ matches: true }),
    };
    haptic('tap');
    expect(calls).toEqual([]);
  });
  test('no-ops when navigator.vibrate is unavailable', () => {
    (globalThis as { navigator?: unknown }).navigator = {};
    haptic('tap');
    expect(calls).toEqual([]);
  });
});
