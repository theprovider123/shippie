export const BOTTOM_TAP_CANCEL_DISTANCE = 8;

export function shouldCancelBottomTap(dx: number, dy: number): boolean {
  return Math.abs(dx) > BOTTOM_TAP_CANCEL_DISTANCE || dy > BOTTOM_TAP_CANCEL_DISTANCE;
}
