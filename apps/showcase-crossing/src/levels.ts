/**
 * Crossing — level definitions + deterministic-from-date daily layout.
 *
 * A level is a stack of lanes from bottom (start) to top (goal).
 * Lane kinds:
 *   - safe       — frog can stand still, no death
 *   - road       — vehicles slide horizontally; frog dies if hit
 *   - river      — water; frog must ride a log/turtle to survive
 *
 * Each non-safe lane has a `speed` (cells/sec, signed; negative =
 * left-to-right) and `density` (probability that a given period
 * contains a vehicle/log).
 *
 * Levels generated programmatically by `generateLevel(n)` so we don't
 * hand-author 30 layouts. Each level seeds its lane parameters from
 * its number; daily layout uses the date hash.
 */

export const COLS = 13;
export const ROWS = 13;

export type LaneKind = 'safe' | 'road' | 'river';

export interface Lane {
  kind: LaneKind;
  /** Cells per second. Sign indicates direction. 0 for safe lanes. */
  speed: number;
  /** Probability of an obstacle per spawn period. 0 for safe lanes. */
  density: number;
  /** Length of a vehicle / log in cells. */
  length: number;
  /** Stable per-lane seed (so spawn cadence is reproducible per level). */
  seed: number;
}

export interface Level {
  lanes: Lane[]; // index 0 = bottom (start), last = top (goal)
  goalRow: number;
  startRow: number;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a level. Layout (bottom-up):
 *   row 0      — start safe lane
 *   row 1-5    — five road lanes (cars), speed scales with level
 *   row 6      — middle median safe lane
 *   row 7-11   — five river lanes (logs), speed scales with level
 *   row 12     — goal safe lane (top)
 *
 * Difficulty curve: speed grows linearly with level number; density
 * grows logarithmically (so later levels are denser without being
 * impossibly packed).
 */
export function generateLevel(n: number, seedSalt = 0): Level {
  const speedFactor = 1 + (n - 1) * 0.18;
  const densityFactor = 1 + Math.log2(n) * 0.15;
  const rng = mulberry32(djb2(`crossing-l${n}-${seedSalt}`));
  const lanes: Lane[] = [];
  // Row 0: start safe
  lanes.push({ kind: 'safe', speed: 0, density: 0, length: 0, seed: 0 });
  // Rows 1-5: roads
  for (let i = 0; i < 5; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const baseSpeed = 1.4 + i * 0.5;
    lanes.push({
      kind: 'road',
      speed: baseSpeed * speedFactor * dir,
      density: Math.min(0.5, 0.18 * densityFactor + i * 0.03),
      length: 2,
      seed: Math.floor(rng() * 0x7fffffff),
    });
  }
  // Row 6: median safe
  lanes.push({ kind: 'safe', speed: 0, density: 0, length: 0, seed: 0 });
  // Rows 7-11: river logs
  for (let i = 0; i < 5; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const baseSpeed = 1.0 + i * 0.4;
    lanes.push({
      kind: 'river',
      speed: baseSpeed * speedFactor * dir,
      // Density slightly lower for river to keep it survivable
      density: Math.min(0.55, 0.22 * densityFactor + i * 0.04),
      length: i % 2 === 0 ? 3 : 2,
      seed: Math.floor(rng() * 0x7fffffff),
    });
  }
  // Row 12: goal safe
  lanes.push({ kind: 'safe', speed: 0, density: 0, length: 0, seed: 0 });

  return { lanes, goalRow: 12, startRow: 0 };
}

/** 30-level campaign — one canonical seed salt = 0. */
export const CAMPAIGN_LEVELS = 30;

export function dailySeedForDate(date: string): number {
  return djb2(`crossing-daily-${date}-v1`);
}

/**
 * Endless mode: a fresh procedural level rolled per "stage" (every
 * time the frog reaches the goal we generate a new layout). Difficulty
 * scales with stage number, capped so very long runs stay playable.
 */
export function generateEndless(stage: number, worldSalt = 0): Level {
  // Cap difficulty growth at stage 25 so endless runs can go forever
  // without becoming impossible.
  const effective = Math.min(25, stage);
  return generateLevel(effective + 1, worldSalt + stage * 17);
}

/**
 * Compute obstacle slots for a lane at a given time. For each lane we
 * tile the world horizontally with period = (length + gap), and offset
 * each tile by `t * speed`. Whether a tile renders an obstacle is
 * determined by a deterministic per-tile RNG seeded with the lane seed
 * + the tile index, compared against `density`.
 *
 * Returns an array of obstacle x-positions (in cell units, possibly
 * fractional + outside [0, COLS)) for the visible window.
 */
export function laneObstacles(lane: Lane, t: number): number[] {
  if (lane.kind === 'safe') return [];
  const gap = 4;
  const period = lane.length + gap;
  const offset = (t * lane.speed) % period;
  const obstacles: number[] = [];
  // Walk a window slightly wider than COLS so vehicles wrapping the
  // edge are rendered correctly.
  const start = -period * 2;
  const end = COLS + period * 2;
  for (let x = start; x < end; x += period) {
    const tileIdx = Math.floor((x - offset) / period);
    const r = mulberry32(lane.seed ^ (tileIdx & 0x7fffffff))();
    if (r < lane.density) {
      obstacles.push(x + offset);
    }
  }
  return obstacles;
}

/**
 * Returns true if the frog (col, row) is colliding with any obstacle
 * in `lane` at time t. A collision means the frog overlaps the rect
 * [obstacleX, obstacleX+length).
 */
export function hitsObstacle(lane: Lane, t: number, frogCol: number): boolean {
  if (lane.kind === 'safe') return false;
  for (const x of laneObstacles(lane, t)) {
    if (frogCol + 1 > x && frogCol < x + lane.length) return true;
  }
  return false;
}

/**
 * For river lanes, returns the obstacle (log) the frog is on so we can
 * carry the frog with it. Returns null if the frog is not on a log
 * (which means death by drowning).
 */
export function logUnderFrog(lane: Lane, t: number, frogCol: number): { x: number; length: number; speed: number } | null {
  if (lane.kind !== 'river') return null;
  for (const x of laneObstacles(lane, t)) {
    if (frogCol + 0.5 >= x && frogCol + 0.5 < x + lane.length) {
      return { x, length: lane.length, speed: lane.speed };
    }
  }
  return null;
}
