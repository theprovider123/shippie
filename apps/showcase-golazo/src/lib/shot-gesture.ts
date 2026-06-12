import { normaliseShotPlacement, zoneFromX, type ShotPlacement } from "./duel";

export interface SwipePoint {
  x: number;
  y: number;
  /** Pointer timestamp in ms, when available. */
  t?: number;
}

export interface SwipeMetrics {
  start: SwipePoint;
  end: SwipePoint;
  dx: number;
  dy: number;
  distance: number;
  durationMs: number;
  speed: number;
  power: number;
  curl: number;
  smoothness: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function endpoints(points: SwipePoint[]): [SwipePoint, SwipePoint] {
  const start = points[0] ?? { x: 0, y: 0, t: 0 };
  const end = points[points.length - 1] ?? start;
  return [start, end];
}

/**
 * Signed curve of the gesture path: positive bends right, negative bends left.
 * Sensitivity is tuned so a moderately curved thumb swipe (≈10px of arc over a
 * half-screen flick) produces clearly visible bend (~0.3); the ±1 clamp keeps
 * extreme scribbles from breaking placement.
 */
export function curlFromSwipePath(points: SwipePoint[], width: number, sensitivity = 0.085): number {
  if (points.length < 3 || width <= 0) return 0;
  const [a, b] = endpoints(points);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (!p) continue;
    sum += ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    count++;
  }
  if (!count) return 0;
  return clamp(sum / (count * width * sensitivity), -1, 1);
}

/** 0..1: high for one clean arc, low for jittery zig-zags. */
export function swipeSmoothness(points: SwipePoint[]): number {
  if (points.length < 4) return 0.65;
  let turn = 0;
  let count = 0;
  for (let i = 2; i < points.length; i++) {
    const a0 = points[i - 2];
    const a1 = points[i - 1];
    const b1 = points[i];
    if (!a0 || !a1 || !b1) continue;
    const ax = a1.x - a0.x;
    const ay = a1.y - a0.y;
    const bx = b1.x - a1.x;
    const by = b1.y - a1.y;
    const al = Math.hypot(ax, ay);
    const bl = Math.hypot(bx, by);
    if (al < 1 || bl < 1) continue;
    turn += Math.acos(clamp((ax * bx + ay * by) / (al * bl), -1, 1));
    count++;
  }
  if (!count) return 0.65;
  return clamp(1 - (turn / count) / 1.05, 0, 1);
}

export function swipeMetrics(points: SwipePoint[], width: number, height: number): SwipeMetrics {
  const [start, end] = endpoints(points);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const durationMs = Math.max(16, (end.t ?? 0) - (start.t ?? 0));
  const speed = distance / durationMs;
  const distancePower = distance / Math.max(1, height * 0.62);
  const speedPower = speed / 1.15;
  const power = clamp(0.34 + distancePower * 0.42 + speedPower * 0.32, 0.42, 1.18);
  return {
    start,
    end,
    dx,
    dy,
    distance,
    durationMs,
    speed,
    power,
    curl: curlFromSwipePath(points, width),
    smoothness: swipeSmoothness(points),
  };
}

export function penaltyPlacementFromSwipe(
  points: SwipePoint[],
  goal: { left: number; right: number; top: number; height: number },
  spot: { x: number; y: number },
  field: { width: number; height: number },
  index = 0,
): ShotPlacement | null {
  const m = swipeMetrics(points, field.width, field.height);
  if (m.dy > -14 || m.distance < Math.max(18, field.height * 0.035)) return null;
  const targetX = spot.x + m.dx;
  const targetY = spot.y + m.dy;
  const x = clamp((targetX - goal.left) / (goal.right - goal.left), 0.04, 0.96);
  const y = clamp((goal.top + goal.height - targetY) / goal.height, 0.08, 0.96);
  return normaliseShotPlacement(
    { zone: zoneFromX(x), x, y, power: m.power, bend: m.curl },
    zoneFromX(x),
    index,
  );
}
