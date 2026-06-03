import { describe, expect, test } from 'vitest';
import {
  BOTTOM_TAP_CANCEL_DISTANCE,
  DRAWER_DISMISS_DISTANCE,
  DRAWER_DISMISS_VELOCITY,
  isHorizontalDrawerGesture,
  shouldCancelBottomTap,
  shouldDismissDrawer,
} from './app-switcher-gesture';

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

describe('drawer swipe-down dismissal', () => {
  test('dismisses on enough downward distance or velocity', () => {
    expect(shouldDismissDrawer(DRAWER_DISMISS_DISTANCE + 1, 500)).toBe(true);
    expect(shouldDismissDrawer(40, Math.floor(40 / DRAWER_DISMISS_VELOCITY) - 1)).toBe(true);
  });

  test('keeps short slow drags open', () => {
    expect(shouldDismissDrawer(DRAWER_DISMISS_DISTANCE, 500)).toBe(false);
    expect(shouldDismissDrawer(24, 500)).toBe(false);
  });

  test('cancels horizontal gestures before treating them as drawer pulls', () => {
    expect(isHorizontalDrawerGesture(24, 4)).toBe(true);
    expect(isHorizontalDrawerGesture(12, 4)).toBe(false);
    expect(isHorizontalDrawerGesture(24, 30)).toBe(false);
  });
});
