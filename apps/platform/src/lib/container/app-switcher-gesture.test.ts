import { describe, expect, test } from 'vitest';
import { BOTTOM_TAP_CANCEL_DISTANCE, shouldCancelBottomTap } from './app-switcher-gesture';

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
});
