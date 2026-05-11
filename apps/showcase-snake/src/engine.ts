/**
 * Snake engine — pure data, framework-agnostic.
 *
 * Coordinate system: integer (col, row) in [0, SIZE). The snake is an
 * array of cells, head at index 0. Direction is one of N/E/S/W. The
 * apple is a single cell. Power-pellet is an optional bonus cell that
 * appears every PELLET_INTERVAL apples for PELLET_WINDOW_MS.
 *
 * Daily mode: apple sequence + initial direction seeded from the
 * date-hash so every player on a given date sees the same run.
 */

export const SIZE = 20;

export type Direction = 'N' | 'E' | 'S' | 'W';
export type Mode = 'classic' | 'loop' | 'daily';

export interface Cell {
  c: number; // column
  r: number; // row
}

export interface World {
  snake: Cell[]; // [head, body, tail]
  /**
   * Snake positions BEFORE the most recent step. Renderers lerp each
   * segment from prevSnake[i] → snake[i] using `stepProgress` so the
   * snake glides smoothly between cells instead of teleporting.
   */
  prevSnake: Cell[];
  dir: Direction;
  /** Next direction queued by user input; applied on next step. */
  queuedDir: Direction | null;
  apple: Cell;
  /** When non-null, an extra-scoring pellet exists at this cell. */
  pellet: { cell: Cell; expiresAtMs: number } | null;
  applesEaten: number;
  pelletsEaten: number;
  score: number;
  /** Total ms since spawn, drives step cadence + pellet expiry. */
  worldTimeMs: number;
  /** Visual progress 0..1 between the last and next step. */
  stepProgress: number;
  /** ms accumulator since the last committed step. */
  msSinceStep: number;
  /** Tick (step) counter for engine determinism. */
  step: number;
  /** Game state. */
  state: 'playing' | 'over';
  /** RNG state for daily / classic apple spawning. */
  rngState: number;
  mode: Mode;
  /** Slow-motion multiplier while a pellet's afterglow is active. */
  slowUntilMs: number;
}

const PELLET_INTERVAL = 30;
const PELLET_WINDOW_MS = 5000;
const SLOW_AFTER_PELLET_MS = 3000;

const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number): { next: () => number; readState: () => number } {
  let a = seed >>> 0;
  return {
    next: () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    readState: () => a,
  };
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(date = todayKey()): number {
  return djb2(`snake-${date}-v1`);
}

/** Initial step cadence (ms per cell). Slower = easier. */
export const BASE_STEP_MS = 160;
/** Speed-up factor per 5 apples eaten. */
const SPEED_TIER_INTERVAL = 5;
const SPEED_TIER_FACTOR = 0.92;
/** Hard minimum so the game stays human-playable. */
const MIN_STEP_MS = 60;

export function stepIntervalMs(world: World): number {
  const tiers = Math.floor(world.applesEaten / SPEED_TIER_INTERVAL);
  let ms = BASE_STEP_MS * Math.pow(SPEED_TIER_FACTOR, tiers);
  if (world.worldTimeMs < world.slowUntilMs) ms *= 1.6;
  return Math.max(MIN_STEP_MS, ms);
}

export function createWorld(mode: Mode, seed?: number): World {
  const sd = seed ?? (mode === 'daily' ? dailySeed() : Math.floor(Math.random() * 0x7fffffff));
  const rng = mulberry32(sd);
  // Start in the middle, length 3, facing east.
  const mid = Math.floor(SIZE / 2);
  const snake: Cell[] = [
    { c: mid + 1, r: mid },
    { c: mid, r: mid },
    { c: mid - 1, r: mid },
  ];
  const world: World = {
    snake,
    prevSnake: snake.map((c) => ({ ...c })),
    dir: 'E',
    queuedDir: null,
    apple: { c: 0, r: 0 }, // placeholder, fixed below
    pellet: null,
    applesEaten: 0,
    pelletsEaten: 0,
    score: 0,
    worldTimeMs: 0,
    stepProgress: 0,
    msSinceStep: 0,
    step: 0,
    state: 'playing',
    rngState: rng.readState(),
    mode,
    slowUntilMs: 0,
  };
  world.apple = pickFreeCell(world, rng);
  world.rngState = rng.readState();
  return world;
}

function pickFreeCell(world: World, rng: { next: () => number }): Cell {
  const occupied = new Set(world.snake.map((c) => `${c.c},${c.r}`));
  if (world.apple) occupied.add(`${world.apple.c},${world.apple.r}`);
  if (world.pellet) occupied.add(`${world.pellet.cell.c},${world.pellet.cell.r}`);
  // Bounded retry; if the board fills, we've won and the caller handles it.
  for (let i = 0; i < 200; i++) {
    const c = Math.floor(rng.next() * SIZE);
    const r = Math.floor(rng.next() * SIZE);
    if (!occupied.has(`${c},${r}`)) return { c, r };
  }
  // Fall-through: linear scan for any free cell.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!occupied.has(`${c},${r}`)) return { c, r };
    }
  }
  return { c: 0, r: 0 }; // board full — caller treats as a win
}

export function queueDirection(world: World, dir: Direction): void {
  if (world.state !== 'playing') return;
  // Can't reverse into yourself in one step.
  if (OPPOSITE[dir] === world.dir) return;
  world.queuedDir = dir;
}

/**
 * Advance the snake one cell. Returns whether the step happened (false
 * means the world is no longer playing).
 */
export function stepWorld(world: World): boolean {
  if (world.state !== 'playing') return false;
  // Snapshot the current snake positions so the renderer can lerp
  // each segment from its previous cell to its new cell over the
  // next step interval.
  world.prevSnake = world.snake.map((c) => ({ ...c }));
  world.stepProgress = 0;
  world.msSinceStep = 0;
  if (world.queuedDir) {
    world.dir = world.queuedDir;
    world.queuedDir = null;
  }
  const head = world.snake[0]!;
  let nc = head.c;
  let nr = head.r;
  if (world.dir === 'N') nr -= 1;
  else if (world.dir === 'S') nr += 1;
  else if (world.dir === 'E') nc += 1;
  else if (world.dir === 'W') nc -= 1;

  // Wall handling — loop wraps, classic + daily die.
  if (nc < 0 || nc >= SIZE || nr < 0 || nr >= SIZE) {
    if (world.mode === 'loop') {
      nc = (nc + SIZE) % SIZE;
      nr = (nr + SIZE) % SIZE;
    } else {
      world.state = 'over';
      return false;
    }
  }
  // Self-collision: bite kills (head moving into any non-tail cell).
  // We allow entering the current tail cell because it'll move out
  // this step UNLESS we're about to grow.
  const willEat = nc === world.apple.c && nr === world.apple.r;
  const willEatPellet = world.pellet && nc === world.pellet.cell.c && nr === world.pellet.cell.r;
  const cellsToAvoid = willEat ? world.snake : world.snake.slice(0, -1);
  for (const seg of cellsToAvoid) {
    if (seg.c === nc && seg.r === nr) {
      world.state = 'over';
      return false;
    }
  }

  // Move head.
  world.snake.unshift({ c: nc, r: nr });
  if (willEat) {
    world.applesEaten += 1;
    world.score += 10;
    const rng = mulberry32(world.rngState);
    world.apple = pickFreeCell(world, rng);
    world.rngState = rng.readState();
    // Maybe spawn a pellet.
    if (
      world.pellet === null &&
      world.applesEaten > 0 &&
      world.applesEaten % PELLET_INTERVAL === 0
    ) {
      const pelletRng = mulberry32(world.rngState ^ 0xA5A5);
      world.pellet = {
        cell: pickFreeCell(world, pelletRng),
        expiresAtMs: world.worldTimeMs + PELLET_WINDOW_MS,
      };
    }
  } else if (willEatPellet && world.pellet) {
    world.pelletsEaten += 1;
    world.score += 100;
    world.pellet = null;
    world.slowUntilMs = world.worldTimeMs + SLOW_AFTER_PELLET_MS;
    // Pellet doesn't grow the snake; still drop the tail so length stays.
    world.snake.pop();
  } else {
    world.snake.pop();
  }

  world.step += 1;

  // Pellet expiry.
  if (world.pellet && world.worldTimeMs >= world.pellet.expiresAtMs) {
    world.pellet = null;
  }

  return true;
}

/**
 * Advance time and the visual step progress. Commits a step when the
 * accumulator crosses one step interval. Returns the number of
 * committed steps (usually 0 or 1; >1 only if the dtMs frame is
 * unusually long).
 */
export function tickWorld(world: World, dtMs: number): number {
  if (world.state !== 'playing') return 0;
  world.worldTimeMs += dtMs;
  world.msSinceStep += dtMs;
  let steps = 0;
  // Loop in case a long frame contains multiple steps.
  while (world.state === 'playing' && world.msSinceStep >= stepIntervalMs(world)) {
    const interval = stepIntervalMs(world);
    world.msSinceStep -= interval;
    stepWorld(world);
    steps += 1;
  }
  // Update fractional progress for the renderer.
  const interval = stepIntervalMs(world);
  world.stepProgress = Math.min(1, Math.max(0, world.msSinceStep / interval));
  return steps;
}

export function isOver(world: World): boolean {
  return world.state === 'over';
}

/** Visual position of segment i as a fractional (col, row). */
export function visualPosition(world: World, i: number): { c: number; r: number } {
  const cur = world.snake[i];
  if (!cur) return { c: 0, r: 0 };
  const prev = world.prevSnake[i] ?? cur;
  // Wrap-aware lerp: if the cell changed by more than one in either
  // axis, the snake crossed a wall in loop mode. Snap directly so
  // we don't draw a long sliding line across the field.
  const dc = cur.c - prev.c;
  const dr = cur.r - prev.r;
  if (Math.abs(dc) > 1 || Math.abs(dr) > 1) return { c: cur.c, r: cur.r };
  const t = world.stepProgress;
  return { c: prev.c + dc * t, r: prev.r + dr * t };
}
