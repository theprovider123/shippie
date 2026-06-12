// apps/showcase-crossing/src/game/lanes.ts

export const COLS = 13;
export const ROWS = 13;

// Home slot columns in the 13-col grid (classic Frogger: 5 slots at odd cols)
export const HOME_SLOTS: readonly number[] = [1, 3, 5, 7, 9] as const;

export type LaneKind = 'safe' | 'road' | 'river' | 'home';

export interface Obstacle {
  /** Left edge in fractional cell units */
  x: number;
  /** Width in cells */
  width: number;
  kind: 'car' | 'lorry' | 'log-sm' | 'log-md' | 'log-lg' | 'turtle';
  /** Which car colour variant (0-2) */
  colorIdx: number;
}

export interface TurtleGroup {
  /** Left edge in fractional cell units */
  x: number;
  /** Number of turtles (2 or 3) */
  count: number;
  /** true when fully submerged */
  submerged: boolean;
  /** fractional dive progress 0=surface 1=submerged */
  diveProgress: number;
}

export interface LaneConfig {
  kind: LaneKind;
  /** Cells per second, sign = direction (+= right) */
  speed: number;
  /** For road: obstacle width in cells. For river: log size (lg/md/sm/turtle) */
  obstacleWidth: number;
  /** Gap between obstacles in cells */
  gap: number;
  /** RNG seed for this lane */
  seed: number;
  /** Probability this slot spawns an obstacle (road) or is a large log (river) */
  density: number;
  /** River lanes: fraction of turtle groups that dive at this level */
  diveFraction: number;
}

export interface Level {
  lanes: LaneConfig[];  // index 0 = row 0 (bottom start verge), 12 = home row
  speedMultiplier: number;
  level: number;
}

// ── deterministic RNG ────────────────────────────────────────────────

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── level generation ─────────────────────────────────────────────────

export function generateLevel(n: number): Level {
  const speedMultiplier = 1 + (n - 1) * 0.2;
  const diveFraction = Math.min(0.8, 0.1 + (n - 1) * 0.07);
  const rng = mulberry32(djb2(`crossing-level-${n}`));

  const lanes: LaneConfig[] = [];

  // Row 0: start verge (safe)
  lanes.push({ kind: 'safe', speed: 0, obstacleWidth: 0, gap: 0, seed: 0, density: 0, diveFraction: 0 });

  // Rows 1-5: road lanes
  for (let i = 0; i < 5; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const baseSpeed = (2.0 + i * 0.6) * speedMultiplier;
    const obsWidth = i >= 3 ? 2 : i >= 1 ? 2 : 3; // mix of cars/lorries
    lanes.push({
      kind: 'road',
      speed: baseSpeed * dir,
      obstacleWidth: obsWidth,
      gap: 3 + i,
      seed: Math.floor(rng() * 0x7fffffff),
      density: 0.55 + i * 0.03,
      diveFraction: 0,
    });
  }

  // Row 6: median (safe)
  lanes.push({ kind: 'safe', speed: 0, obstacleWidth: 0, gap: 0, seed: 0, density: 0, diveFraction: 0 });

  // Rows 7-11: river lanes
  const riverKinds: Array<'log-lg' | 'log-md' | 'log-sm' | 'turtle'> = ['log-lg', 'turtle', 'log-md', 'log-lg', 'turtle'];
  const riverWidths = [4, 3, 3, 4, 3];
  for (let i = 0; i < 5; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const baseSpeed = (1.5 + i * 0.5) * speedMultiplier;
    lanes.push({
      kind: 'river',
      speed: baseSpeed * dir,
      obstacleWidth: riverWidths[i]!,
      gap: 4 - Math.floor(i * 0.3),
      seed: Math.floor(rng() * 0x7fffffff),
      density: 0.5 + i * 0.04,
      diveFraction: riverKinds[i] === 'turtle' ? diveFraction : 0,
    });
  }

  // Row 12: home row
  lanes.push({ kind: 'home', speed: 0, obstacleWidth: 0, gap: 0, seed: 0, density: 0, diveFraction: 0 });

  return { lanes, speedMultiplier, level: n };
}

// ── obstacle stream ──────────────────────────────────────────────────

/**
 * Compute all obstacle left-edge positions (fractional cell units) for a
 * lane at simulation time t (seconds). Wraps around COLS.
 * For river lanes, returns log positions (turtles handled separately via turtleGroupsForLane).
 */
export function obstaclesForLane(lane: LaneConfig, t: number): Obstacle[] {
  if (lane.kind === 'safe' || lane.kind === 'home') return [];
  const period = lane.obstacleWidth + lane.gap;
  const offset = ((t * lane.speed) % period + period * 10) % period;
  const obstacles: Obstacle[] = [];
  const rng = mulberry32(lane.seed);

  // Walk a window wider than COLS so obstacles at both edges render
  const start = -period * 2;
  const end = COLS + period * 2;
  let tileIdx = 0;
  for (let x = start; x < end; x += period, tileIdx++) {
    const slotRng = mulberry32(lane.seed ^ ((tileIdx & 0x7fff) * 0x1f3d5b7));
    if (slotRng() >= lane.density) continue;
    const colorIdx = Math.floor(rng() * 3);
    const worldX = x + offset;
    const kind: Obstacle['kind'] = lane.kind === 'road'
      ? (lane.obstacleWidth >= 3 ? 'lorry' : colorIdx === 2 ? 'lorry' : 'car')
      : lane.obstacleWidth >= 4 ? 'log-lg' : lane.obstacleWidth === 3 ? 'log-md' : 'log-sm';
    obstacles.push({ x: worldX, width: lane.obstacleWidth, kind, colorIdx });
  }
  return obstacles;
}

/**
 * Returns turtle groups for a river lane at time t.
 * Each group is 2-3 turtles wide. Groups dive based on diveFraction + a
 * per-group phase offset.
 */
export function turtleGroupsForLane(lane: LaneConfig, t: number): TurtleGroup[] {
  if (lane.kind !== 'river' || lane.diveFraction === 0) return [];
  const period = lane.obstacleWidth + lane.gap;
  const offset = ((t * lane.speed) % period + period * 10) % period;
  const groups: TurtleGroup[] = [];
  const DIVE_CYCLE = 11; // seconds per full cycle
  const SUBMERGE_DUR = 3; // seconds submerged per cycle

  const start = -period * 2;
  const end = COLS + period * 2;
  let tileIdx = 0;
  for (let x = start; x < end; x += period, tileIdx++) {
    const slotRng = mulberry32(lane.seed ^ ((tileIdx & 0x7fff) * 0x2e4a6c8));
    if (slotRng() >= lane.density) continue;
    const count = slotRng() < 0.5 ? 2 : 3;
    const worldX = x + offset;
    // Per-group phase offset so not all turtles dive simultaneously
    const phase = slotRng();
    const cyclePos = (t / DIVE_CYCLE + phase) % 1;
    const submerged = cyclePos > (1 - SUBMERGE_DUR / DIVE_CYCLE);
    // diveProgress: 0 = fully surfaced, 1 = fully submerged
    const diveStart = 1 - SUBMERGE_DUR / DIVE_CYCLE;
    const diveProgress = cyclePos > diveStart
      ? Math.min(1, (cyclePos - diveStart) / 0.15)
      : 0;
    groups.push({ x: worldX, count, submerged, diveProgress });
  }
  return groups;
}

/**
 * For a frog at fractional column frogX on a river lane at time t:
 * returns the drift speed (cells/sec) if standing on a log/turtle, else null (drown).
 * A diving turtle group with diveProgress >= 1 counts as water (null).
 */
export function rideableUnder(lane: LaneConfig, t: number, frogX: number): number | null {
  if (lane.kind !== 'river') return null;

  // Check logs first
  if (lane.diveFraction === 0) {
    for (const obs of obstaclesForLane(lane, t)) {
      if (frogX + 0.5 >= obs.x && frogX + 0.5 < obs.x + obs.width) {
        return lane.speed;
      }
    }
    return null;
  }

  // Check turtle groups
  for (const grp of turtleGroupsForLane(lane, t)) {
    const grpWidth = grp.count; // 1 cell per turtle
    if (frogX + 0.5 >= grp.x && frogX + 0.5 < grp.x + grpWidth) {
      return grp.diveProgress >= 1 ? null : lane.speed;
    }
  }
  return null;
}
