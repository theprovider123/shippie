/**
 * Bulwark — tower-defence engine.
 *
 * Pure module. The App holds a `World` state and advances ticks at
 * 60Hz (tick = 1/60s). Each tick:
 *   1. Spawn enemies if a wave is in progress.
 *   2. Move existing enemies along the path.
 *   3. Towers seek targets in range and fire (cooldown enforced).
 *   4. Resolve damage; remove dead enemies (award currency).
 *   5. Check for wave end / level lose.
 *
 * Designed for deterministic execution so co-op mesh mode can use
 * lockstep simulation (per the arcade-v2 plan): both peers run the
 * same simulation locally; only commands cross the wire.
 */

export const GRID_W = 18;
export const GRID_H = 12;
export const TICK_RATE = 60;

export type TowerType = 'gun' | 'cannon' | 'missile' | 'slow' | 'emp' | 'sniper';
export const TOWER_TYPES: TowerType[] = ['gun', 'cannon', 'missile', 'slow', 'emp', 'sniper'];

export interface TowerSpec {
  cost: number;
  range: number;
  damage: number;
  cooldownMs: number;
  splash?: number;
  slowFactor?: number;
  slowDurationMs?: number;
  description: string;
}

export const TOWER_SPECS: Record<TowerType, TowerSpec[]> = {
  gun: [
    { cost: 50, range: 3.5, damage: 10, cooldownMs: 350, description: 'Reliable single-target' },
    { cost: 80, range: 4, damage: 18, cooldownMs: 320, description: 'Faster + harder' },
    { cost: 140, range: 4.5, damage: 30, cooldownMs: 280, description: 'Veteran gunner' },
  ],
  cannon: [
    { cost: 90, range: 3, damage: 30, cooldownMs: 900, splash: 1.2, description: 'AoE 1.2 cells' },
    { cost: 160, range: 3.5, damage: 55, cooldownMs: 850, splash: 1.5, description: 'Bigger splash' },
    { cost: 260, range: 4, damage: 95, cooldownMs: 800, splash: 2.0, description: 'Devastator' },
  ],
  missile: [
    { cost: 120, range: 6, damage: 40, cooldownMs: 1100, description: 'Long-range single' },
    { cost: 200, range: 7, damage: 75, cooldownMs: 1000, description: 'Sky claim' },
    { cost: 320, range: 8, damage: 130, cooldownMs: 950, description: 'Cross-map killer' },
  ],
  slow: [
    { cost: 60, range: 3, damage: 4, cooldownMs: 600, slowFactor: 0.6, slowDurationMs: 800, description: 'Slows targets 40%' },
    { cost: 100, range: 3.5, damage: 8, cooldownMs: 550, slowFactor: 0.45, slowDurationMs: 1100, description: 'Stronger slow' },
    { cost: 180, range: 4, damage: 14, cooldownMs: 500, slowFactor: 0.3, slowDurationMs: 1500, description: 'Glacial' },
  ],
  emp: [
    { cost: 140, range: 3, damage: 0, cooldownMs: 4000, slowFactor: 0, slowDurationMs: 1500, description: 'Stuns enemies in burst' },
    { cost: 220, range: 3.5, damage: 0, cooldownMs: 3500, slowFactor: 0, slowDurationMs: 2000, description: 'Wider stun' },
    { cost: 340, range: 4, damage: 5, cooldownMs: 3000, slowFactor: 0, slowDurationMs: 2500, description: 'Stun + chip' },
  ],
  sniper: [
    { cost: 160, range: 9, damage: 80, cooldownMs: 1500, description: 'Picks priority targets' },
    { cost: 240, range: 10, damage: 140, cooldownMs: 1400, description: 'Headshots' },
    { cost: 400, range: 12, damage: 240, cooldownMs: 1300, description: 'Lethal at range' },
  ],
};

export interface Tower {
  id: number;
  type: TowerType;
  tier: 0 | 1 | 2;
  x: number; // grid coord
  y: number;
  cooldownLeft: number; // ms
}

export interface Enemy {
  id: number;
  /** Distance travelled along path (cells). */
  dist: number;
  hp: number;
  maxHp: number;
  baseSpeed: number; // cells/sec
  slowUntil: number; // ms timestamp
  slowFactor: number;
  reward: number;
  size: number;
}

export interface World {
  tick: number; // monotonic
  path: { x: number; y: number }[]; // cells along the enemy path
  towers: Tower[];
  enemies: Enemy[];
  bank: number;
  lives: number;
  wave: number;
  waveActive: boolean;
  enemiesToSpawn: number;
  spawnCooldownMs: number;
  nextEntityId: number;
  score: number;
  over: boolean;
  won: boolean;
}

/** Produce a fixed S-curve path across the grid. */
export function makePath(): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  // Enter from left at y=2, sweep right to x=12, down to y=8, left to x=4, down to y=10, right to x=GRID_W.
  const lerpRow = (y: number, x0: number, x1: number) => {
    const step = x1 > x0 ? 1 : -1;
    for (let x = x0; x !== x1 + step; x += step) path.push({ x, y });
  };
  const lerpCol = (x: number, y0: number, y1: number) => {
    const step = y1 > y0 ? 1 : -1;
    for (let y = y0; y !== y1 + step; y += step) path.push({ x, y });
  };
  lerpRow(2, 0, 12);
  lerpCol(12, 2, 8);
  lerpRow(8, 12, 4);
  lerpCol(4, 8, 10);
  lerpRow(10, 4, GRID_W - 1);
  return path;
}

export function createWorld(): World {
  return {
    tick: 0,
    path: makePath(),
    towers: [],
    enemies: [],
    bank: 200,
    lives: 20,
    wave: 0,
    waveActive: false,
    enemiesToSpawn: 0,
    spawnCooldownMs: 0,
    nextEntityId: 1,
    score: 0,
    over: false,
    won: false,
  };
}

export function startWave(world: World): void {
  if (world.over || world.won) return;
  world.wave++;
  world.waveActive = true;
  world.enemiesToSpawn = waveEnemyCount(world.wave);
  world.spawnCooldownMs = 0;
}

function waveEnemyCount(wave: number): number {
  return 5 + wave * 2;
}

function spawnEnemy(world: World): void {
  const wave = world.wave;
  const baseHp = 30 + wave * 18;
  const baseSpeed = 1.0 + wave * 0.05;
  const reward = 8 + wave * 2;
  const enemy: Enemy = {
    id: world.nextEntityId++,
    dist: 0,
    hp: baseHp,
    maxHp: baseHp,
    baseSpeed,
    slowUntil: 0,
    slowFactor: 1,
    reward,
    size: 0.45,
  };
  world.enemies.push(enemy);
}

function pathPosition(world: World, dist: number): { x: number; y: number } | null {
  const idx = Math.floor(dist);
  if (idx >= world.path.length) return null;
  const a = world.path[idx]!;
  const b = world.path[idx + 1] ?? a;
  const t = dist - idx;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function enemyPos(world: World, enemy: Enemy): { x: number; y: number } | null {
  return pathPosition(world, enemy.dist);
}

export function tower(spec: TowerSpec[], tier: 0 | 1 | 2): TowerSpec {
  return spec[tier]!;
}

export function placeTower(world: World, type: TowerType, x: number, y: number): boolean {
  // Can't place on path.
  if (world.path.some((p) => p.x === x && p.y === y)) return false;
  // Can't place on existing tower.
  if (world.towers.some((t) => t.x === x && t.y === y)) return false;
  const cost = TOWER_SPECS[type][0]!.cost;
  if (world.bank < cost) return false;
  world.bank -= cost;
  world.towers.push({
    id: world.nextEntityId++,
    type,
    tier: 0,
    x,
    y,
    cooldownLeft: 0,
  });
  return true;
}

export function upgradeTower(world: World, towerId: number): boolean {
  const t = world.towers.find((t) => t.id === towerId);
  if (!t || t.tier >= 2) return false;
  const next = (t.tier + 1) as 0 | 1 | 2;
  const cost = TOWER_SPECS[t.type][next]!.cost;
  if (world.bank < cost) return false;
  world.bank -= cost;
  t.tier = next;
  return true;
}

export function sellTower(world: World, towerId: number): boolean {
  const idx = world.towers.findIndex((t) => t.id === towerId);
  if (idx < 0) return false;
  const t = world.towers[idx]!;
  // Refund 50% of total invested.
  let invested = 0;
  for (let i = 0; i <= t.tier; i++) invested += TOWER_SPECS[t.type][i]!.cost;
  world.bank += Math.floor(invested * 0.5);
  world.towers.splice(idx, 1);
  return true;
}

/** Advance the simulation by `dt` seconds. */
export function tickWorld(world: World, dt: number): void {
  if (world.over || world.won) return;
  world.tick++;
  const dtMs = dt * 1000;
  // Spawn.
  if (world.waveActive && world.enemiesToSpawn > 0) {
    world.spawnCooldownMs -= dtMs;
    if (world.spawnCooldownMs <= 0) {
      spawnEnemy(world);
      world.enemiesToSpawn--;
      world.spawnCooldownMs = 800;
    }
  }
  // Move enemies.
  const surviving: Enemy[] = [];
  for (const e of world.enemies) {
    if (e.hp <= 0) {
      world.bank += e.reward;
      world.score += e.reward;
      continue;
    }
    const slowed = e.slowUntil > world.tick * dtMs ? e.slowFactor : 1;
    e.dist += e.baseSpeed * slowed * dt;
    if (e.dist >= world.path.length - 1) {
      world.lives--;
      if (world.lives <= 0) {
        world.over = true;
        return;
      }
      continue;
    }
    surviving.push(e);
  }
  world.enemies = surviving;
  // Towers fire.
  const nowMs = world.tick * dtMs;
  for (const t of world.towers) {
    t.cooldownLeft -= dtMs;
    if (t.cooldownLeft > 0) continue;
    const spec = TOWER_SPECS[t.type][t.tier]!;
    // Find target in range — prefer the enemy furthest along the path
    // (most threatening) for sniper, nearest for everyone else.
    let target: Enemy | null = null;
    let bestMetric = t.type === 'sniper' ? -Infinity : Infinity;
    for (const e of world.enemies) {
      const pos = enemyPos(world, e);
      if (!pos) continue;
      const dx = pos.x - t.x;
      const dy = pos.y - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist > spec.range) continue;
      const metric = t.type === 'sniper' ? e.dist : dist;
      const better = t.type === 'sniper' ? metric > bestMetric : metric < bestMetric;
      if (better) {
        bestMetric = metric;
        target = e;
      }
    }
    if (!target) continue;
    target.hp -= spec.damage;
    if (spec.slowFactor !== undefined && spec.slowDurationMs !== undefined) {
      target.slowUntil = nowMs + spec.slowDurationMs;
      target.slowFactor = spec.slowFactor;
    }
    // Splash.
    if (spec.splash) {
      const tpos = enemyPos(world, target);
      if (tpos) {
        for (const e of world.enemies) {
          if (e === target) continue;
          const ep = enemyPos(world, e);
          if (!ep) continue;
          const d = Math.hypot(ep.x - tpos.x, ep.y - tpos.y);
          if (d <= spec.splash) e.hp -= spec.damage * 0.6;
        }
      }
    }
    t.cooldownLeft = spec.cooldownMs;
  }
  // Wave end.
  if (world.waveActive && world.enemiesToSpawn === 0 && world.enemies.length === 0) {
    world.waveActive = false;
    world.bank += 50 + world.wave * 5;
    if (world.wave >= 20) {
      world.won = true;
    }
  }
}

export function enemyPositions(world: World): Array<{ id: number; x: number; y: number; hp: number; maxHp: number }> {
  return world.enemies
    .map((e) => {
      const pos = enemyPos(world, e);
      return pos ? { id: e.id, x: pos.x, y: pos.y, hp: e.hp, maxHp: e.maxHp } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
