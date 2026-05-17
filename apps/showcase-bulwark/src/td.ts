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

/**
 * Enemy visual + stat archetype. Cycled per wave so the player sees
 * variety: grunts at low waves, runners every 3rd, tanks at high
 * waves, bosses every 5th wave.
 */
export type EnemyClass = 'grunt' | 'runner' | 'tank' | 'boss';

export interface Enemy {
  id: number;
  kind: EnemyClass;
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

/**
 * Visual projectile in flight. Lives in the World so the renderer can
 * animate it without re-implementing the engine's targeting logic.
 * Spawned by `tickWorld` every time a tower fires; auto-cleared once
 * the projectile reaches its target (or the target's last position
 * if the target died mid-flight).
 */
export interface Projectile {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  spawnedTickMs: number;
  durationMs: number;
  kind: 'bullet' | 'shell' | 'missile' | 'frost' | 'emp' | 'laser';
  colour: string;
}

export type SpecialAbility = 'carpet' | 'freeze' | 'reinforce';

export interface World {
  tick: number; // monotonic
  path: { x: number; y: number }[]; // cells along the enemy path
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
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
  /** Monotonic ms accumulator from tickWorld(dt) — drives projectile fade. */
  worldTimeMs: number;
  /** Special-ability cooldown end timestamps (worldTimeMs). 0 = ready. */
  specialReadyAt: Record<SpecialAbility, number>;
  /** Sandbox mode: infinite money, no death. */
  sandbox: boolean;
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

export function createWorld(opts: { sandbox?: boolean } = {}): World {
  return {
    tick: 0,
    path: makePath(),
    towers: [],
    enemies: [],
    projectiles: [],
    bank: opts.sandbox ? 99999 : 200,
    lives: opts.sandbox ? 999 : 20,
    wave: 0,
    waveActive: false,
    enemiesToSpawn: 0,
    spawnCooldownMs: 0,
    nextEntityId: 1,
    score: 0,
    over: false,
    won: false,
    worldTimeMs: 0,
    specialReadyAt: { carpet: 0, freeze: 0, reinforce: 0 },
    sandbox: opts.sandbox === true,
  };
}

/** Special-ability cooldown durations in ms. */
export const SPECIAL_COOLDOWNS: Record<SpecialAbility, number> = {
  carpet: 60_000,
  freeze: 90_000,
  reinforce: 120_000,
};

/**
 * Trigger a player-activated special ability if its cooldown has
 * elapsed. Returns true on success, false if still on cooldown.
 *
 *   - carpet:    ~50% damage to every alive enemy on the screen.
 *   - freeze:    slow all enemies to 30% speed for 6 seconds.
 *   - reinforce: refund 100 to bank + restore 5 lives.
 */
export function triggerSpecial(world: World, kind: SpecialAbility): boolean {
  if (world.over || world.won) return false;
  if (world.worldTimeMs < world.specialReadyAt[kind]) return false;
  world.specialReadyAt[kind] = world.worldTimeMs + SPECIAL_COOLDOWNS[kind];
  if (kind === 'carpet') {
    for (const e of world.enemies) {
      if (e.hp > 0) e.hp -= e.maxHp * 0.5;
    }
  } else if (kind === 'freeze') {
    for (const e of world.enemies) {
      e.slowUntil = world.worldTimeMs + 6000;
      e.slowFactor = 0.3;
    }
  } else if (kind === 'reinforce') {
    world.bank += 100;
    world.lives = Math.min(20, world.lives + 5);
  }
  return true;
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

/**
 * Pick the enemy archetype for the next spawn. Boss every 5th wave,
 * tank every 4th, runner every 3rd, otherwise grunt. Mixed via the
 * existing spawn cadence so a single wave shows visible variety.
 */
function pickEnemyClass(wave: number, indexInWave: number): EnemyClass {
  if (wave > 0 && wave % 5 === 0 && indexInWave === 0) return 'boss';
  if (indexInWave % 4 === 3 && wave >= 3) return 'tank';
  if (indexInWave % 3 === 2 && wave >= 2) return 'runner';
  return 'grunt';
}

function spawnEnemy(world: World): void {
  const wave = world.wave;
  const indexInWave = waveEnemyCount(wave) - world.enemiesToSpawn;
  const kind = pickEnemyClass(wave, indexInWave);
  const baseHp = 30 + wave * 18;
  const baseSpeed = 1.0 + wave * 0.05;
  const reward = 8 + wave * 2;
  // Per-class multipliers — runners are fast + frail, tanks slow +
  // beefy, bosses both slow and tough but worth far more.
  const tuning: Record<EnemyClass, { hp: number; speed: number; reward: number; size: number }> = {
    grunt:  { hp: 1.0, speed: 1.0, reward: 1.0, size: 0.45 },
    runner: { hp: 0.6, speed: 1.7, reward: 1.0, size: 0.4 },
    tank:   { hp: 2.4, speed: 0.6, reward: 1.6, size: 0.55 },
    boss:   { hp: 6.0, speed: 0.55, reward: 4.0, size: 0.7 },
  };
  const t = tuning[kind];
  const hp = Math.round(baseHp * t.hp);
  const enemy: Enemy = {
    id: world.nextEntityId++,
    kind,
    dist: 0,
    hp,
    maxHp: hp,
    baseSpeed: baseSpeed * t.speed,
    slowUntil: 0,
    slowFactor: 1,
    reward: Math.round(reward * t.reward),
    size: t.size,
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

const PROJECTILE_COLOURS: Record<Projectile['kind'], string> = {
  bullet: '#FFFFFF',
  shell: '#F4B860',
  missile: '#E84A2D',
  frost: '#7AC4E8',
  emp: '#7E5B96',
  laser: '#E84A2D',
};

const PROJECTILE_DURATIONS: Record<Projectile['kind'], number> = {
  bullet: 100,
  shell: 320,
  missile: 260,
  frost: 180,
  emp: 240,
  laser: 80,
};

const TOWER_PROJECTILE_KIND: Record<TowerType, Projectile['kind']> = {
  gun: 'bullet',
  cannon: 'shell',
  missile: 'missile',
  slow: 'frost',
  emp: 'emp',
  sniper: 'laser',
};

/** Advance the simulation by `dt` seconds. */
export function tickWorld(world: World, dt: number): void {
  if (world.over || world.won) return;
  world.tick++;
  const dtMs = dt * 1000;
  world.worldTimeMs += dtMs;
  // Cull expired projectiles before towers add new ones.
  if (world.projectiles.length > 0) {
    const cutoff = world.worldTimeMs;
    world.projectiles = world.projectiles.filter(
      (p) => p.spawnedTickMs + p.durationMs > cutoff,
    );
  }
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
    const slowed = e.slowUntil > world.worldTimeMs ? e.slowFactor : 1;
    e.dist += e.baseSpeed * slowed * dt;
    if (e.dist >= world.path.length - 1) {
      if (!world.sandbox) {
        world.lives--;
        if (world.lives <= 0) {
          world.over = true;
          return;
        }
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
    const targetPos = enemyPos(world, target);
    if (targetPos) {
      const kind = TOWER_PROJECTILE_KIND[t.type];
      world.projectiles.push({
        id: world.nextEntityId++,
        fromX: t.x + 0.5,
        fromY: t.y + 0.5,
        toX: targetPos.x,
        toY: targetPos.y,
        spawnedTickMs: world.worldTimeMs,
        durationMs: PROJECTILE_DURATIONS[kind],
        kind,
        colour: PROJECTILE_COLOURS[kind],
      });
    }
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

export interface EnemyView {
  id: number;
  kind: EnemyClass;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  size: number;
}

export function enemyPositions(world: World): EnemyView[] {
  return world.enemies
    .map((e) => {
      const pos = enemyPos(world, e);
      return pos
        ? { id: e.id, kind: e.kind, x: pos.x, y: pos.y, hp: e.hp, maxHp: e.maxHp, size: e.size }
        : null;
    })
    .filter((x): x is EnemyView => x !== null);
}

/**
 * Snapshot live projectiles for the renderer along with `progress`
 * (0..1 from spawn to landing) so the React layer can lerp between
 * the start + end coordinates without re-implementing timing.
 */
export interface ProjectileView {
  id: number;
  kind: Projectile['kind'];
  colour: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
}

export function projectileViews(world: World): ProjectileView[] {
  const out: ProjectileView[] = [];
  for (const p of world.projectiles) {
    const elapsed = world.worldTimeMs - p.spawnedTickMs;
    const progress = Math.min(1, Math.max(0, elapsed / p.durationMs));
    out.push({
      id: p.id,
      kind: p.kind,
      colour: p.colour,
      fromX: p.fromX,
      fromY: p.fromY,
      toX: p.toX,
      toY: p.toY,
      progress,
    });
  }
  return out;
}
