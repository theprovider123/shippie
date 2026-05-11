/**
 * Drift engine — vector-style asteroid shooter. Pure data, framework-
 * agnostic. World wraps at edges; ship physics use friction so thrust
 * + rotation feels classic Asteroids.
 */

export const FIELD_W = 360;
export const FIELD_H = 540;
export const SHIP_R = 8;
export const BULLET_SPEED = 260;
export const BULLET_LIFETIME_MS = 1200;
export const THRUST_ACCEL = 220;
export const FRICTION = 0.6; // velocity decay per second
export const ROTATE_RATE = 3.6; // radians per second
export const MAX_SPEED = 260;
export const HYPER_COOLDOWN_MS = 12_000;
export const FIRE_COOLDOWN_MS = 180;

export type AsteroidSize = 'large' | 'medium' | 'small';

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading in radians, 0 = up (-y). */
  heading: number;
  thrusting: boolean;
  /** ms timestamp when ship can fire again. */
  fireReadyAt: number;
  /** ms timestamp when hyperspace becomes available. */
  hyperReadyAt: number;
  /** Brief i-frames after spawn/respawn. */
  invulnUntilMs: number;
}

export interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radius in world units. */
  r: number;
  size: AsteroidSize;
  /** Visual hull (vertices as offsets from centre). */
  hull: Array<readonly [number, number]>;
  /** Rotation speed in rad/sec. */
  spin: number;
  /** Current rotation. */
  rot: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnedAtMs: number;
}

export interface Ufo {
  x: number;
  y: number;
  vx: number;
  fireCooldownMs: number;
}

export interface World {
  ship: Ship;
  asteroids: Asteroid[];
  bullets: Bullet[];
  ufo: Ufo | null;
  score: number;
  lives: number;
  wave: number;
  worldTimeMs: number;
  nextEntityId: number;
  state: 'playing' | 'over';
  rngState: number;
  /** Spawning a new wave is paused for this ms after the last asteroid pops. */
  nextWaveAtMs: number | null;
  /** UFO spawn schedule. */
  ufoCooldownMs: number;
}

const ASTEROID_RADIUS: Record<AsteroidSize, number> = { large: 22, medium: 13, small: 7 };
const ASTEROID_POINTS: Record<AsteroidSize, number> = { large: 20, medium: 50, small: 100 };

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
  return djb2(`drift-${date}-v1`);
}

function jaggedHull(size: AsteroidSize, rng: () => number): Array<readonly [number, number]> {
  const r = ASTEROID_RADIUS[size];
  const verts = size === 'large' ? 10 : size === 'medium' ? 8 : 6;
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < verts; i++) {
    const a = (i / verts) * Math.PI * 2;
    const jitter = 0.7 + rng() * 0.6;
    out.push([Math.cos(a) * r * jitter, Math.sin(a) * r * jitter] as const);
  }
  return out;
}

function spawnAsteroid(world: World, rng: () => number, size: AsteroidSize, x?: number, y?: number): Asteroid {
  const safeRadius = 60;
  let sx: number = x ?? 12;
  let sy: number = y ?? 12;
  if (x === undefined || y === undefined) {
    for (let i = 0; i < 16; i++) {
      const tx = rng() * FIELD_W;
      const ty = rng() * FIELD_H;
      if (Math.hypot(tx - world.ship.x, ty - world.ship.y) > safeRadius) {
        sx = tx; sy = ty; break;
      }
    }
  }
  const angle = rng() * Math.PI * 2;
  const speed = 30 + rng() * 40 + (size === 'small' ? 30 : 0);
  return {
    id: world.nextEntityId++,
    x: sx, y: sy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: ASTEROID_RADIUS[size],
    size,
    hull: jaggedHull(size, rng),
    spin: (rng() - 0.5) * 2,
    rot: rng() * Math.PI * 2,
  };
}

export function createWorld(seed?: number): World {
  const sd = seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = mulberry32(sd);
  const w: World = {
    ship: {
      x: FIELD_W / 2,
      y: FIELD_H / 2,
      vx: 0, vy: 0,
      heading: 0,
      thrusting: false,
      fireReadyAt: 0,
      hyperReadyAt: 0,
      invulnUntilMs: 2000,
    },
    asteroids: [],
    bullets: [],
    ufo: null,
    score: 0,
    lives: 4,
    wave: 1,
    worldTimeMs: 0,
    nextEntityId: 1,
    state: 'playing',
    rngState: rng.readState(),
    nextWaveAtMs: null,
    ufoCooldownMs: 14_000,
  };
  spawnWave(w);
  return w;
}

export function spawnWave(world: World): void {
  const count = 3 + world.wave;
  const rng = mulberry32(world.rngState);
  for (let i = 0; i < count; i++) {
    world.asteroids.push(spawnAsteroid(world, rng.next, 'large'));
  }
  world.rngState = rng.readState();
}

export function setShipControls(world: World, input: { rotate: -1 | 0 | 1; thrust: boolean; firing: boolean }): void {
  if (world.state !== 'playing') return;
  world.ship.heading += input.rotate * ROTATE_RATE * (16 / 1000);
  world.ship.thrusting = input.thrust;
}

export function rotateShip(world: World, deltaSec: number, dir: -1 | 1): void {
  if (world.state !== 'playing') return;
  world.ship.heading += dir * ROTATE_RATE * deltaSec;
}

export function tryFire(world: World): boolean {
  if (world.state !== 'playing') return false;
  if (world.worldTimeMs < world.ship.fireReadyAt) return false;
  world.ship.fireReadyAt = world.worldTimeMs + FIRE_COOLDOWN_MS;
  // Bullet starts at the nose, heading along ship.heading. Heading
  // convention: 0 = up (-y), positive = clockwise.
  const dx = Math.sin(world.ship.heading);
  const dy = -Math.cos(world.ship.heading);
  world.bullets.push({
    id: world.nextEntityId++,
    x: world.ship.x + dx * (SHIP_R + 2),
    y: world.ship.y + dy * (SHIP_R + 2),
    vx: dx * BULLET_SPEED + world.ship.vx,
    vy: dy * BULLET_SPEED + world.ship.vy,
    spawnedAtMs: world.worldTimeMs,
  });
  return true;
}

export function tryHyperspace(world: World): boolean {
  if (world.state !== 'playing') return false;
  if (world.worldTimeMs < world.ship.hyperReadyAt) return false;
  world.ship.hyperReadyAt = world.worldTimeMs + HYPER_COOLDOWN_MS;
  const rng = mulberry32(world.rngState ^ Math.floor(world.worldTimeMs));
  world.ship.x = rng.next() * FIELD_W;
  world.ship.y = rng.next() * FIELD_H;
  world.ship.vx = 0;
  world.ship.vy = 0;
  world.ship.invulnUntilMs = world.worldTimeMs + 1500;
  world.rngState = rng.readState();
  return true;
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

export function tickWorld(world: World, dtMs: number): void {
  if (world.state !== 'playing') return;
  world.worldTimeMs += dtMs;
  const dt = dtMs / 1000;

  // Ship physics.
  const dx = Math.sin(world.ship.heading);
  const dy = -Math.cos(world.ship.heading);
  if (world.ship.thrusting) {
    world.ship.vx += dx * THRUST_ACCEL * dt;
    world.ship.vy += dy * THRUST_ACCEL * dt;
  }
  // Friction (exponential decay).
  const decay = Math.pow(1 - FRICTION, dt);
  world.ship.vx *= decay;
  world.ship.vy *= decay;
  const speed = Math.hypot(world.ship.vx, world.ship.vy);
  if (speed > MAX_SPEED) {
    world.ship.vx = (world.ship.vx / speed) * MAX_SPEED;
    world.ship.vy = (world.ship.vy / speed) * MAX_SPEED;
  }
  world.ship.x = wrap(world.ship.x + world.ship.vx * dt, FIELD_W);
  world.ship.y = wrap(world.ship.y + world.ship.vy * dt, FIELD_H);

  // Bullets.
  for (const b of world.bullets) {
    b.x = wrap(b.x + b.vx * dt, FIELD_W);
    b.y = wrap(b.y + b.vy * dt, FIELD_H);
  }
  world.bullets = world.bullets.filter((b) => world.worldTimeMs - b.spawnedAtMs < BULLET_LIFETIME_MS);

  // Asteroids.
  for (const a of world.asteroids) {
    a.x = wrap(a.x + a.vx * dt, FIELD_W);
    a.y = wrap(a.y + a.vy * dt, FIELD_H);
    a.rot += a.spin * dt;
  }

  // Bullet-vs-asteroid collisions.
  const survivors: Asteroid[] = [];
  const spawned: Asteroid[] = [];
  for (const a of world.asteroids) {
    let hit = false;
    for (const b of world.bullets) {
      if (b.spawnedAtMs < 0) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) < a.r) {
        hit = true;
        b.spawnedAtMs = -1; // mark for removal
        break;
      }
    }
    if (!hit) { survivors.push(a); continue; }
    world.score += ASTEROID_POINTS[a.size];
    if (a.size !== 'small') {
      const nextSize: AsteroidSize = a.size === 'large' ? 'medium' : 'small';
      const rng = mulberry32(world.rngState ^ a.id);
      spawned.push(spawnAsteroid(world, rng.next, nextSize, a.x, a.y));
      spawned.push(spawnAsteroid(world, rng.next, nextSize, a.x, a.y));
      world.rngState = rng.readState();
    }
  }
  world.asteroids = survivors.concat(spawned);
  world.bullets = world.bullets.filter((b) => b.spawnedAtMs >= 0);

  // UFO.
  if (!world.ufo) {
    world.ufoCooldownMs -= dtMs;
    if (world.ufoCooldownMs <= 0) {
      const fromLeft = Math.random() < 0.5;
      world.ufo = {
        x: fromLeft ? -10 : FIELD_W + 10,
        y: 40 + Math.random() * (FIELD_H - 80),
        vx: fromLeft ? 80 : -80,
        fireCooldownMs: 1400,
      };
      world.ufoCooldownMs = 18000 + Math.random() * 12000;
    }
  }
  if (world.ufo) {
    world.ufo.x += world.ufo.vx * dt;
    world.ufo.fireCooldownMs -= dtMs;
    if (world.ufo.fireCooldownMs <= 0) {
      // Fire at ship.
      const a = Math.atan2(world.ship.y - world.ufo.y, world.ship.x - world.ufo.x);
      world.bullets.push({
        id: world.nextEntityId++,
        x: world.ufo.x, y: world.ufo.y,
        vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
        spawnedAtMs: world.worldTimeMs + 999_999, // never expires from player table
      });
      // Tag enemy bullets via a special spawnedAtMs convention. To
      // keep the engine simple we treat them as regular bullets that
      // can also hit asteroids. Lifetime handled via field-wrap.
      world.ufo.fireCooldownMs = 1200 + Math.random() * 800;
    }
    if (world.ufo.x < -20 || world.ufo.x > FIELD_W + 20) world.ufo = null;
  }

  // Ship-vs-asteroid collisions (only when not invulnerable).
  if (world.worldTimeMs >= world.ship.invulnUntilMs) {
    for (const a of world.asteroids) {
      if (Math.hypot(world.ship.x - a.x, world.ship.y - a.y) < a.r + SHIP_R) {
        world.lives -= 1;
        if (world.lives <= 0) {
          world.state = 'over';
          return;
        }
        world.ship.x = FIELD_W / 2;
        world.ship.y = FIELD_H / 2;
        world.ship.vx = 0;
        world.ship.vy = 0;
        world.ship.invulnUntilMs = world.worldTimeMs + 2000;
        break;
      }
    }
  }

  // Wave clear → spawn next after a brief delay.
  if (world.asteroids.length === 0 && world.nextWaveAtMs === null) {
    world.nextWaveAtMs = world.worldTimeMs + 1200;
  }
  if (world.nextWaveAtMs !== null && world.worldTimeMs >= world.nextWaveAtMs) {
    world.wave += 1;
    world.nextWaveAtMs = null;
    spawnWave(world);
  }
}
