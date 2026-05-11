/**
 * Bricks engine — Breakout-style. Pure data, framework-agnostic.
 *
 * Coordinate system: (x, y) in world units. FIELD_W=320, FIELD_H=460.
 * Ball/paddle physics are deterministic per dtMs so engine tests can
 * step a fixed number of ms and assert positions.
 */

export const FIELD_W = 320;
export const FIELD_H = 460;
export const PADDLE_W = 60;
export const PADDLE_H = 8;
export const PADDLE_Y = FIELD_H - 30;
export const BALL_R = 5;
export const BRICK_COLS = 8;
export const BRICK_ROWS = 6;
export const BRICK_GAP = 2;
export const BRICK_W = (FIELD_W - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS;
export const BRICK_H = 14;
export const BRICK_TOP = 40;
export const POWERUP_W = 18;
export const POWERUP_H = 8;
export const POWERUP_VY = 100;

export type PowerUpKind = 'wide' | 'sticky' | 'multi' | 'laser';

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Attached to paddle (sticky); released on click. */
  attached: boolean;
}

export interface Brick {
  col: number;
  row: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  points: number;
  colour: string;
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  kind: PowerUpKind;
}

export interface Laser {
  id: number;
  x: number;
  y: number;
}

export interface World {
  level: number;
  score: number;
  lives: number;
  paddle: { x: number; w: number };
  balls: Ball[];
  bricks: Brick[];
  powerups: PowerUp[];
  lasers: Laser[];
  rapidUntilMs: number; // not currently used; reserved
  stickyUntilMs: number;
  laserUntilMs: number;
  worldTimeMs: number;
  nextEntityId: number;
  /** RNG state for deterministic level + power-up rolls. */
  rngState: number;
  state: 'playing' | 'lost' | 'won';
  /** Pending start delay between life loss and next launch. */
  launchAtMs: number | null;
  /** True if the player can still control paddle.x. */
  controlsLive: boolean;
}

const BRICK_PALETTE: Array<{ hp: number; points: number; colour: string }> = [
  { hp: 1, points: 10, colour: '#7AC4E8' },
  { hp: 1, points: 20, colour: '#4FA487' },
  { hp: 1, points: 30, colour: '#F4B860' },
  { hp: 2, points: 50, colour: '#E8924C' },
  { hp: 2, points: 70, colour: '#E84A2D' },
  { hp: 3, points: 100, colour: '#7E5B96' },
];

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
  return djb2(`bricks-${date}-v1`);
}

/**
 * Bake a level's brick layout. Level N uses progressively harder
 * bricks. Hand-authored patterns up to lvl 5; lvl 6+ procedurally
 * generated from a seed for variety.
 */
function brickLayoutFor(level: number, rng: () => number): Brick[] {
  const bricks: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      // Skip about 15% of cells on harder levels for shape variety.
      if (level > 4 && rng() < 0.15) continue;
      // Pick a palette tier biased by row (top = harder) + level.
      const tier = Math.min(BRICK_PALETTE.length - 1, Math.floor(r / 2) + Math.floor(level / 4));
      const def = BRICK_PALETTE[tier]!;
      const x = BRICK_GAP + c * (BRICK_W + BRICK_GAP);
      const y = BRICK_TOP + r * (BRICK_H + BRICK_GAP);
      bricks.push({
        col: c, row: r, x, y,
        hp: def.hp, maxHp: def.hp,
        points: def.points,
        colour: def.colour,
      });
    }
  }
  return bricks;
}

export function createWorld(level: number, seed?: number): World {
  const sd = seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = mulberry32(sd ^ level);
  const w: World = {
    level,
    score: 0,
    lives: 3,
    paddle: { x: FIELD_W / 2, w: PADDLE_W },
    balls: [],
    bricks: brickLayoutFor(level, rng.next),
    powerups: [],
    lasers: [],
    rapidUntilMs: 0,
    stickyUntilMs: 0,
    laserUntilMs: 0,
    worldTimeMs: 0,
    nextEntityId: 1,
    rngState: rng.readState(),
    state: 'playing',
    launchAtMs: null,
    controlsLive: true,
  };
  spawnBall(w, /* attached */ true);
  return w;
}

function spawnBall(world: World, attached: boolean): void {
  const ball: Ball = {
    id: world.nextEntityId++,
    x: world.paddle.x,
    y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1,
    vx: 0,
    vy: 0,
    attached,
  };
  world.balls.push(ball);
}

export function movePaddleTo(world: World, x: number): void {
  if (!world.controlsLive) return;
  world.paddle.x = Math.max(world.paddle.w / 2, Math.min(FIELD_W - world.paddle.w / 2, x));
  // Sticky balls follow the paddle.
  for (const b of world.balls) {
    if (b.attached) b.x = world.paddle.x;
  }
}

export function launchBall(world: World): void {
  // Release every attached ball at a moderate up-angle.
  for (const b of world.balls) {
    if (!b.attached) continue;
    b.attached = false;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6; // slight randomness
    const speed = 220;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
  }
}

export function fireLasers(world: World): void {
  if (world.worldTimeMs >= world.laserUntilMs) return;
  world.lasers.push({ id: world.nextEntityId++, x: world.paddle.x - 6, y: PADDLE_Y - PADDLE_H });
  world.lasers.push({ id: world.nextEntityId++, x: world.paddle.x + 6, y: PADDLE_Y - PADDLE_H });
}

function applyPowerUp(world: World, kind: PowerUpKind): void {
  if (kind === 'wide') {
    world.paddle.w = Math.min(PADDLE_W * 1.8, world.paddle.w * 1.5);
  } else if (kind === 'sticky') {
    world.stickyUntilMs = world.worldTimeMs + 10000;
  } else if (kind === 'multi') {
    // Spawn 2 extra balls from each existing live ball.
    const live = world.balls.filter((b) => !b.attached);
    for (const b of live.slice(0, 2)) {
      for (const angle of [-Math.PI / 3, Math.PI / 3]) {
        const speed = Math.hypot(b.vx, b.vy) || 220;
        const ax = Math.cos(-Math.PI / 2 + angle) * speed;
        const ay = Math.sin(-Math.PI / 2 + angle) * speed;
        world.balls.push({ id: world.nextEntityId++, x: b.x, y: b.y, vx: ax, vy: ay, attached: false });
      }
    }
  } else if (kind === 'laser') {
    world.laserUntilMs = world.worldTimeMs + 8000;
  }
}

export function tickWorld(world: World, dtMs: number): void {
  if (world.state !== 'playing') return;
  world.worldTimeMs += dtMs;
  const dt = dtMs / 1000;

  // Balls.
  for (const b of world.balls) {
    if (b.attached) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Walls.
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    if (b.x + BALL_R > FIELD_W) { b.x = FIELD_W - BALL_R; b.vx = -Math.abs(b.vx); }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
    // Paddle.
    if (
      b.vy > 0 &&
      b.y + BALL_R >= PADDLE_Y &&
      b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
      b.x >= world.paddle.x - world.paddle.w / 2 - BALL_R &&
      b.x <= world.paddle.x + world.paddle.w / 2 + BALL_R
    ) {
      const offset = (b.x - world.paddle.x) / (world.paddle.w / 2);
      const angle = -Math.PI / 2 + offset * (Math.PI / 3);
      const speed = Math.max(220, Math.hypot(b.vx, b.vy) * 1.02);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      b.y = PADDLE_Y - BALL_R - 1;
      if (world.worldTimeMs < world.stickyUntilMs) b.attached = true;
    }
    // Bricks.
    for (const brick of world.bricks) {
      if (brick.hp <= 0) continue;
      if (
        b.x + BALL_R > brick.x &&
        b.x - BALL_R < brick.x + BRICK_W &&
        b.y + BALL_R > brick.y &&
        b.y - BALL_R < brick.y + BRICK_H
      ) {
        // Reflect — pick axis with smallest overlap.
        const overlapX = Math.min(b.x + BALL_R - brick.x, brick.x + BRICK_W - (b.x - BALL_R));
        const overlapY = Math.min(b.y + BALL_R - brick.y, brick.y + BRICK_H - (b.y - BALL_R));
        if (overlapX < overlapY) b.vx = -b.vx;
        else b.vy = -b.vy;
        brick.hp -= 1;
        if (brick.hp <= 0) {
          world.score += brick.points;
          // 18% chance to drop a power-up.
          const rng = mulberry32(world.rngState ^ brick.col * 31 + brick.row);
          if (rng.next() < 0.18) {
            const roll = rng.next();
            const kind: PowerUpKind = roll < 0.3 ? 'wide' : roll < 0.55 ? 'sticky' : roll < 0.8 ? 'multi' : 'laser';
            world.powerups.push({
              id: world.nextEntityId++,
              x: brick.x + BRICK_W / 2,
              y: brick.y + BRICK_H,
              kind,
            });
          }
          world.rngState = rng.readState();
        }
        break;
      }
    }
    // Fall off bottom.
    if (b.y - BALL_R > FIELD_H) {
      // Mark for removal; if it was the last live ball, lose a life.
      b.attached = true;
      b.x = -1; // sentinel "lost"
    }
  }
  // Clean up lost balls.
  const live = world.balls.filter((b) => b.x >= 0);
  if (live.length === 0 && world.balls.length > 0) {
    world.balls = [];
    world.lives -= 1;
    if (world.lives <= 0) {
      world.state = 'lost';
      return;
    }
    spawnBall(world, true);
  } else {
    world.balls = live;
  }

  // Power-ups fall.
  for (const p of world.powerups) {
    p.y += POWERUP_VY * dt;
    if (
      p.y + POWERUP_H >= PADDLE_Y &&
      p.y <= PADDLE_Y + PADDLE_H &&
      p.x >= world.paddle.x - world.paddle.w / 2 &&
      p.x <= world.paddle.x + world.paddle.w / 2
    ) {
      applyPowerUp(world, p.kind);
      p.y = FIELD_H + 100; // mark for removal
    }
  }
  world.powerups = world.powerups.filter((p) => p.y <= FIELD_H + 10);

  // Lasers move up.
  for (const l of world.lasers) {
    l.y -= 360 * dt;
    for (const brick of world.bricks) {
      if (brick.hp <= 0) continue;
      if (
        l.x > brick.x && l.x < brick.x + BRICK_W &&
        l.y > brick.y && l.y < brick.y + BRICK_H
      ) {
        brick.hp -= 1;
        if (brick.hp <= 0) world.score += brick.points;
        l.y = -100;
        break;
      }
    }
  }
  world.lasers = world.lasers.filter((l) => l.y > -10);

  // Auto-fire lasers when the power-up is active.
  if (world.worldTimeMs < world.laserUntilMs && Math.floor(world.worldTimeMs / 300) !== Math.floor((world.worldTimeMs - dtMs) / 300)) {
    fireLasers(world);
  }

  // Level cleared?
  if (world.bricks.every((b) => b.hp <= 0)) {
    world.state = 'won';
  }
}

export function aliveBrickCount(world: World): number {
  return world.bricks.filter((b) => b.hp > 0).length;
}
