export const DRAWER_DISMISS_DISTANCE = 96;
export const DRAWER_DISMISS_VELOCITY = 0.65;
export const DRAWER_HORIZONTAL_CANCEL_DISTANCE = 18;

export function isHorizontalDrawerGesture(dx: number, dy: number): boolean {
  return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DRAWER_HORIZONTAL_CANCEL_DISTANCE;
}

export function shouldDismissDrawer(dy: number, elapsedMs: number): boolean {
  const safeElapsed = Math.max(1, elapsedMs);
  const downwardDistance = Math.max(0, dy);
  return downwardDistance > DRAWER_DISMISS_DISTANCE || downwardDistance / safeElapsed > DRAWER_DISMISS_VELOCITY;
}
