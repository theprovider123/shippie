import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOTTOM_TAP_CANCEL_DISTANCE, shouldCancelBottomTap } from './app-switcher-gesture';

const HERE = dirname(fileURLToPath(import.meta.url));
const GESTURE_SOURCE = readFileSync(resolve(HERE, 'AppSwitcherGesture.svelte'), 'utf8');

describe('bottom app-switcher tap cancellation', () => {
  test('cancels sideways and downward drags past the gesture slop', () => {
    expect(shouldCancelBottomTap(BOTTOM_TAP_CANCEL_DISTANCE + 1, 0)).toBe(true);
    expect(shouldCancelBottomTap(-(BOTTOM_TAP_CANCEL_DISTANCE + 1), 0)).toBe(true);
    expect(shouldCancelBottomTap(0, BOTTOM_TAP_CANCEL_DISTANCE + 1)).toBe(true);
  });

  test('keeps taps and upward pulls eligible to open the switcher', () => {
    expect(shouldCancelBottomTap(BOTTOM_TAP_CANCEL_DISTANCE, BOTTOM_TAP_CANCEL_DISTANCE)).toBe(false);
    expect(shouldCancelBottomTap(0, -24)).toBe(false);
  });

  test('ignores the finishing tap that follows pointerdown-open', () => {
    expect(GESTURE_SOURCE).toContain('let drawerOpenedAt = 0;');
    expect(GESTURE_SOURCE).toContain('drawerOpenedAt = performance.now();');
    expect(GESTURE_SOURCE).toContain('performance.now() - drawerOpenedAt < 450');
  });
});
