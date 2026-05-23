export const APP_SCALE_AT_OPEN = 0.95;
export const APP_OPACITY_AT_OPEN = 0.5;
export const ENTRY_DURATION_MS = 200;
export const EXIT_DURATION_MS = 150;
export const SPRING_OVERSHOOT = 1.03;
export const BOTTOM_TAP_CANCEL_DISTANCE = 8;

export function shouldCancelBottomTap(dx: number, dy: number): boolean {
  return Math.abs(dx) > BOTTOM_TAP_CANCEL_DISTANCE || dy > BOTTOM_TAP_CANCEL_DISTANCE;
}
