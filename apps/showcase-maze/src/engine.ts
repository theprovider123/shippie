/**
 * Maze engine — pure data + state mutation. Tile-based movement with
 * smooth interpolation between cells so the renderer can lerp without
 * re-implementing AI.
 *
 * Coordinate system: integer (col, row) per the maze layout. Each
 * entity has a `progress` 0..1 representing how far between the
 * current cell and the next cell it is. When `progress >= 1` the
 * entity commits to the next cell, recomputes direction, and resets
 * progress to 0.
 */

import {
  ALL_DIRECTIONS,
  MAZE_H,
  MAZE_W,
  OPPOSITE,
  bfsNextStep,
  isWall,
  parseMaze,
  type Direction,
  type ParsedMaze,
  type Tile,
} from './maze';

export type GhostKind = 'chaser' | 'ambusher' | 'wanderer' | 'coward';
export type GhostMood = 'pen' | 'pursuing' | 'frightened' | 'eaten';

const GHOST_KINDS: GhostKind[] = ['chaser', 'ambusher', 'wanderer', 'coward'];

export interface Entity {
  col: number;
  row: number;
  /** Cell currently moving toward. */
  nextCol: number;
  nextRow: number;
  dir: Direction;
  progress: number; // 0..1
}

export interface Ghost extends Entity {
  kind: GhostKind;
  mood: GhostMood;
  /** When mood = frightened, ms remaining. */
  frightenedMsLeft: number;
}

export interface World {
  parsed: ParsedMaze;
  tiles: Tile[][];
  /** Mutable dot/pellet copy of `tiles` — engine clears as eaten. */
  player: Entity;
  /** Direction the player has queued (next legal turn). */
  queuedDir: Direction | null;
  ghosts: Ghost[];
  score: number;
  lives: number;
  dotsLeft: number;
  pelletsLeft: number;
  level: number;
  /** Combo counter for chained frightened-ghost eats (200/400/800/1600). */
  ghostCombo: number;
  worldTimeMs: number;
  state: 'playing' | 'won' | 'lost';
  rngState: number;
  /** ms remaining until the world unfreezes after a respawn. */
  respawnFreezeMs: number;
  practice: boolean;
}

const PLAYER_SPEED = 5.0; // tiles per second
const GHOST_SPEED = 4.6;
const FRIGHTENED_SPEED = 2.5;
const EATEN_SPEED = 7.5;
const FRIGHTENED_DURATION_MS = 8000;

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

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(date = todayKey()): number {
  return djb2(`maze-${date}-v1`);
}

export function createWorld(opts: { seed?: number; practice?: boolean } = {}): World {
  const parsed = parseMaze();
  // Clone tile grid so we can mutate dot/pellet state without
  // mangling the source layout.
  const tiles: Tile[][] = parsed.tiles.map((row) => [...row]);
  const start = parsed.playerStart;
  const ghosts: Ghost[] = GHOST_KINDS.slice(0, parsed.penCells.length).map((kind, i) => {
    const cell = parsed.penCells[i]!;
    return {
      kind,
      mood: 'pen',
      frightenedMsLeft: 0,
      col: cell.col,
      row: cell.row,
      nextCol: cell.col,
      nextRow: cell.row,
      dir: 'N',
      progress: 0,
    };
  });
  return {
    parsed,
    tiles,
    player: {
      col: start.col, row: start.row,
      nextCol: start.col, nextRow: start.row,
      dir: 'W',
      progress: 0,
    },
    queuedDir: null,
    ghosts,
    score: 0,
    lives: 3,
    dotsLeft: parsed.dotCount,
    pelletsLeft: parsed.pelletCount,
    level: 1,
    ghostCombo: 0,
    worldTimeMs: 0,
    state: 'playing',
    rngState: opts.seed ?? Math.floor(Math.random() * 0x7fffffff),
    respawnFreezeMs: 800,
    practice: opts.practice === true,
  };
}

function canEnter(world: World, col: number, row: number, allowDoor: boolean): boolean {
  if (col < 0 || col >= MAZE_W || row < 0 || row >= MAZE_H) return false;
  const tile = world.tiles[row]![col]!;
  return !isWall(tile, allowDoor);
}

function nextCellInDir(col: number, row: number, dir: Direction): { col: number; row: number } {
  if (dir === 'N') return { col, row: row - 1 };
  if (dir === 'S') return { col, row: row + 1 };
  if (dir === 'E') return { col: col + 1, row };
  return { col: col - 1, row };
}

function tunnelWrap(world: World, col: number, row: number): { col: number; row: number } {
  const t = world.parsed.tunnels[row];
  if (!t) return { col, row };
  if (col < 0) return { col: t[1], row };
  if (col >= MAZE_W) return { col: t[0], row };
  return { col, row };
}

export function queueDirection(world: World, dir: Direction): void {
  if (world.state !== 'playing') return;
  world.queuedDir = dir;
}

function pickPlayerNextCell(world: World): void {
  // Apply queued direction if legal; otherwise continue current direction.
  if (world.queuedDir) {
    const cand = nextCellInDir(world.player.col, world.player.row, world.queuedDir);
    if (canEnter(world, cand.col, cand.row, false)) {
      world.player.dir = world.queuedDir;
      world.queuedDir = null;
    }
  }
  let next = nextCellInDir(world.player.col, world.player.row, world.player.dir);
  next = tunnelWrap(world, next.col, next.row);
  if (canEnter(world, next.col, next.row, false)) {
    world.player.nextCol = next.col;
    world.player.nextRow = next.row;
  } else {
    // Stop at the wall; nextCell = current cell.
    world.player.nextCol = world.player.col;
    world.player.nextRow = world.player.row;
  }
}

function ghostTarget(world: World, g: Ghost): { col: number; row: number } {
  const p = world.player;
  if (g.mood === 'eaten') {
    return { col: world.parsed.penCells[0]!.col, row: world.parsed.penCells[0]!.row };
  }
  if (g.mood === 'frightened') {
    // Flee — target the corner farthest from player.
    const corners = [
      { col: 0, row: 0 }, { col: MAZE_W - 1, row: 0 },
      { col: 0, row: MAZE_H - 1 }, { col: MAZE_W - 1, row: MAZE_H - 1 },
    ];
    let best = corners[0]!;
    let bestD = -1;
    for (const c of corners) {
      const d = Math.abs(c.col - p.col) + Math.abs(c.row - p.row);
      if (d > bestD) { bestD = d; best = c; }
    }
    return best;
  }
  // mood = pursuing.
  if (g.kind === 'chaser') return { col: p.col, row: p.row };
  if (g.kind === 'ambusher') {
    // 4 cells ahead of player heading.
    let { col, row } = p;
    for (let i = 0; i < 4; i++) {
      const n = nextCellInDir(col, row, p.dir);
      if (n.col < 0 || n.col >= MAZE_W || n.row < 0 || n.row >= MAZE_H) break;
      col = n.col; row = n.row;
    }
    return { col, row };
  }
  if (g.kind === 'wanderer') {
    // Random target at intersections; if player is far, bias toward player.
    const d = Math.abs(p.col - g.col) + Math.abs(p.row - g.row);
    if (d > 8) return { col: p.col, row: p.row };
    // Pick a random in-bounds cell.
    const rng = mulberry32(world.rngState ^ g.kind.length * (g.col + 1));
    const tc = Math.floor(rng() * MAZE_W);
    const tr = Math.floor(rng() * MAZE_H);
    return { col: tc, row: tr };
  }
  // Coward — flee when below half the board, otherwise chase loosely.
  if (g.row > MAZE_H / 2) {
    // Flee — invert player position to maze far corner.
    return { col: MAZE_W - 1 - p.col, row: 0 };
  }
  return { col: p.col, row: p.row };
}

function pickGhostNextCell(world: World, g: Ghost): void {
  const allowDoor = g.mood === 'eaten' || g.mood === 'pen';
  if (g.mood === 'pen') {
    // Climb out: target the cell just above the door.
    // Find pen door tile.
    let doorCol = -1, doorRow = -1;
    for (let r = 0; r < MAZE_H; r++) {
      for (let c = 0; c < MAZE_W; c++) {
        if (world.parsed.tiles[r]![c] === '=') { doorCol = c; doorRow = r; }
      }
    }
    if (doorRow < 0) {
      // Fallback: just exit downward
      g.mood = 'pursuing';
      return;
    }
    const target = { col: doorCol, row: doorRow - 1 };
    const dir = bfsNextStep(world.tiles, { col: g.col, row: g.row }, target, true);
    if (dir) {
      g.dir = dir;
    } else {
      g.mood = 'pursuing';
    }
    const cand = nextCellInDir(g.col, g.row, g.dir);
    const next = tunnelWrap(world, cand.col, cand.row);
    if (canEnter(world, next.col, next.row, true)) {
      g.nextCol = next.col; g.nextRow = next.row;
    } else {
      g.nextCol = g.col; g.nextRow = g.row;
    }
    // Promote pen → pursuing once out of pen interior.
    if (world.parsed.tiles[g.row]![g.col] !== 'p' && world.parsed.tiles[g.row]![g.col] !== '=') {
      g.mood = 'pursuing';
    }
    return;
  }

  const target = ghostTarget(world, g);
  const forbidden = OPPOSITE[g.dir]; // don't reverse mid-corridor
  let dir = bfsNextStep(world.tiles, { col: g.col, row: g.row }, target, allowDoor, forbidden);
  // If BFS can't avoid reversing, allow it.
  if (!dir) dir = bfsNextStep(world.tiles, { col: g.col, row: g.row }, target, allowDoor);
  if (!dir) {
    // Stuck — try any legal direction.
    for (const d of ALL_DIRECTIONS) {
      const cand = nextCellInDir(g.col, g.row, d);
      const w = tunnelWrap(world, cand.col, cand.row);
      if (canEnter(world, w.col, w.row, allowDoor)) { dir = d; break; }
    }
  }
  if (!dir) { g.nextCol = g.col; g.nextRow = g.row; return; }
  g.dir = dir;
  const cand = nextCellInDir(g.col, g.row, dir);
  const w = tunnelWrap(world, cand.col, cand.row);
  if (canEnter(world, w.col, w.row, allowDoor)) {
    g.nextCol = w.col; g.nextRow = w.row;
  } else {
    g.nextCol = g.col; g.nextRow = g.row;
  }
}

function eatAt(world: World, col: number, row: number): void {
  const tile = world.tiles[row]?.[col];
  if (tile === '.') {
    world.tiles[row]![col] = ' ';
    world.dotsLeft -= 1;
    world.score += 10;
  } else if (tile === 'o') {
    world.tiles[row]![col] = ' ';
    world.pelletsLeft -= 1;
    world.score += 50;
    world.ghostCombo = 0;
    // Frighten every non-eaten ghost.
    for (const g of world.ghosts) {
      if (g.mood !== 'eaten') {
        g.mood = 'frightened';
        g.frightenedMsLeft = FRIGHTENED_DURATION_MS;
        // Reverse direction (classic Pac-Man behaviour).
        g.dir = OPPOSITE[g.dir];
      }
    }
  }
  if (world.dotsLeft === 0 && world.pelletsLeft === 0) {
    world.state = 'won';
  }
}

function handleGhostCollision(world: World): void {
  if (world.practice) return;
  for (const g of world.ghosts) {
    if (g.mood === 'eaten') continue;
    const dist = Math.abs(g.col - world.player.col) + Math.abs(g.row - world.player.row);
    if (dist === 0) {
      if (g.mood === 'frightened') {
        // Eat the ghost.
        world.ghostCombo = Math.min(4, world.ghostCombo + 1);
        const points = 200 * Math.pow(2, world.ghostCombo - 1);
        world.score += points;
        g.mood = 'eaten';
        g.frightenedMsLeft = 0;
      } else {
        // Player dies.
        world.lives -= 1;
        if (world.lives <= 0) {
          world.state = 'lost';
          return;
        }
        // Reset positions.
        const start = world.parsed.playerStart;
        world.player.col = start.col; world.player.row = start.row;
        world.player.nextCol = start.col; world.player.nextRow = start.row;
        world.player.progress = 0;
        world.queuedDir = null;
        for (let i = 0; i < world.ghosts.length; i++) {
          const cell = world.parsed.penCells[i] ?? world.parsed.penCells[0]!;
          const gg = world.ghosts[i]!;
          gg.col = cell.col; gg.row = cell.row;
          gg.nextCol = cell.col; gg.nextRow = cell.row;
          gg.progress = 0;
          gg.mood = 'pen';
          gg.frightenedMsLeft = 0;
        }
        world.respawnFreezeMs = 1200;
        return;
      }
    }
  }
}

export function tickWorld(world: World, dtMs: number): void {
  if (world.state !== 'playing') return;
  if (world.respawnFreezeMs > 0) {
    world.respawnFreezeMs = Math.max(0, world.respawnFreezeMs - dtMs);
    return;
  }
  world.worldTimeMs += dtMs;
  const dt = dtMs / 1000;

  // Initialise nextCell for the player on first tick.
  if (world.player.nextCol === world.player.col && world.player.nextRow === world.player.row) {
    pickPlayerNextCell(world);
  }

  // Player movement.
  world.player.progress += PLAYER_SPEED * dt;
  if (world.player.progress >= 1) {
    world.player.col = world.player.nextCol;
    world.player.row = world.player.nextRow;
    world.player.progress = 0;
    eatAt(world, world.player.col, world.player.row);
    pickPlayerNextCell(world);
  }

  // Ghosts.
  for (const g of world.ghosts) {
    if (g.frightenedMsLeft > 0) {
      g.frightenedMsLeft -= dtMs;
      if (g.frightenedMsLeft <= 0 && g.mood === 'frightened') {
        g.mood = 'pursuing';
      }
    }
    const speed = g.mood === 'eaten' ? EATEN_SPEED : g.mood === 'frightened' ? FRIGHTENED_SPEED : GHOST_SPEED;
    if (g.nextCol === g.col && g.nextRow === g.row) {
      pickGhostNextCell(world, g);
    }
    g.progress += speed * dt;
    if (g.progress >= 1) {
      g.col = g.nextCol; g.row = g.nextRow;
      g.progress = 0;
      if (g.mood === 'eaten') {
        const start = world.parsed.penCells[0]!;
        if (g.col === start.col && g.row === start.row) {
          g.mood = 'pen';
        }
      }
      pickGhostNextCell(world, g);
    }
  }

  handleGhostCollision(world);
}

export function visualPosition(e: Entity): { x: number; y: number } {
  const dx = e.nextCol - e.col;
  const dy = e.nextRow - e.row;
  return { x: e.col + dx * e.progress, y: e.row + dy * e.progress };
}
