/**
 * Invaders engine — pure data + state-mutation functions, framework-
 * agnostic so the React layer can render it via Canvas without any
 * coupling.
 *
 * Coordinate system: (x, y) in world units where x ∈ [0, FIELD_W] and
 * y ∈ [0, FIELD_H]. Renderer scales to canvas pixels.
 */

export const FIELD_W = 320;
export const FIELD_H = 480;
export const PLAYER_Y = FIELD_H - 30;
export const PLAYER_W = 28;
export const PLAYER_H = 14;
export const BULLET_W = 3;
export const BULLET_H = 10;
export const ENEMY_W = 18;
export const ENEMY_H = 14;
export const COL_GAP = 24;
export const ROW_GAP = 22;
export const FORMATION_TOP = 60;
export const FORMATION_LEFT_PAD = 24;
export const COLS = 11;
export const ROWS = 5;
export const BUNKER_W = 50;
export const BUNKER_H = 22;
export const BUNKER_PIX = 10; // bunker pixel grid resolution (per dim)
export const BUNKER_Y = PLAYER_Y - 50;

export type EnemyKind = 'squid' | 'crab' | 'octopus';
export type ShipKind = 'laser' | 'spread' | 'missile';
export type PowerUpKind = 'rapid' | 'shield' | 'double';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  col: number;
  row: number;
  x: number;
  y: number;
  /** Score awarded on kill. */
  points: number;
  alive: boolean;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vy: number;
  /** Player bullet vs enemy bullet. */
  side: 'player' | 'enemy';
  /** Optional damage override (default 1). */
  damage?: number;
}

export interface UFO {
  x: number;
  y: number;
  vx: number;
  hp: number;
  drops: PowerUpKind;
}

export interface Boss {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  fireCooldownMs: number;
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  vy: number;
  kind: PowerUpKind;
}

export interface Bunker {
  x: number;
  y: number;
  /** Pixel grid: 1 = intact, 0 = destroyed. Indexed [row][col]. */
  cells: number[][];
}

export interface World {
  wave: number;
  score: number;
  lives: number;
  shieldUntilMs: number; // wall-clock ms; <=now means no shield
  rapidUntilMs: number;
  doubleUntilMs: number;
  player: { x: number; vx: number };
  shipKind: ShipKind;
  enemies: Enemy[];
  bullets: Bullet[];
  bunkers: Bunker[];
  ufo: UFO | null;
  boss: Boss | null;
  powerups: PowerUp[];
  formationDir: 1 | -1;
  formationStepMs: number; // ms between formation step-down moves
  formationLastStepAt: number;
  enemyFireCooldownMs: number;
  enemyFireBaseMs: number;
  ufoCooldownMs: number;
  nowMs: number;
  nextEntityId: number;
  shake: number; // 0..1 screen-shake intensity
  /** Game state. */
  state: 'playing' | 'won' | 'lost';
  /** Wave-clear celebration timer (ms remaining). */
  waveClearMs: number;
}

const ENEMY_POINTS: Record<EnemyKind, number> = { octopus: 10, crab: 20, squid: 30 };

function rowKind(row: number): EnemyKind {
  if (row === 0) return 'squid';
  if (row < 3) return 'crab';
  return 'octopus';
}

export function createWorld(shipKind: ShipKind = 'laser'): World {
  const w: World = {
    wave: 1,
    score: 0,
    lives: 3,
    shieldUntilMs: 0,
    rapidUntilMs: 0,
    doubleUntilMs: 0,
    player: { x: FIELD_W / 2, vx: 0 },
    shipKind,
    enemies: [],
    bullets: [],
    bunkers: [],
    ufo: null,
    boss: null,
    powerups: [],
    formationDir: 1,
    formationStepMs: 800,
    formationLastStepAt: 0,
    enemyFireCooldownMs: 1500,
    enemyFireBaseMs: 1500,
    ufoCooldownMs: 8000,
    nowMs: 0,
    nextEntityId: 1,
    shake: 0,
    state: 'playing',
    waveClearMs: 0,
  };
  spawnWave(w);
  spawnBunkers(w);
  return w;
}

export function spawnBunkers(world: World): void {
  world.bunkers = [];
  const slots = 4;
  const totalGap = FIELD_W - BUNKER_W * slots;
  const gap = totalGap / (slots + 1);
  for (let i = 0; i < slots; i++) {
    const cells: number[][] = [];
    for (let r = 0; r < BUNKER_PIX; r++) {
      const row: number[] = [];
      for (let c = 0; c < BUNKER_PIX; c++) {
        // Carve a small inverted-arch bottom-centre cavity.
        const cx = BUNKER_PIX / 2;
        const cy = BUNKER_PIX - 1;
        const dx = c - cx;
        const dy = r - cy;
        const carved = r >= BUNKER_PIX - 2 && Math.abs(dx) <= 1 && dy >= -3;
        row.push(carved ? 0 : 1);
      }
      cells.push(row);
    }
    world.bunkers.push({
      x: gap + i * (BUNKER_W + gap),
      y: BUNKER_Y,
      cells,
    });
  }
}

export function spawnWave(world: World): void {
  world.enemies = [];
  // Boss every 5th wave instead of formation.
  if (world.wave > 0 && world.wave % 5 === 0) {
    world.boss = {
      x: FIELD_W / 2,
      y: 60,
      vx: 60 + world.wave * 2,
      hp: 50 + world.wave * 8,
      maxHp: 50 + world.wave * 8,
      fireCooldownMs: 700,
    };
    return;
  }
  world.boss = null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const kind = rowKind(row);
      world.enemies.push({
        id: world.nextEntityId++,
        kind,
        col,
        row,
        x: FORMATION_LEFT_PAD + col * COL_GAP,
        y: FORMATION_TOP + row * ROW_GAP,
        points: ENEMY_POINTS[kind],
        alive: true,
      });
    }
  }
  // Each subsequent wave gets a touch faster.
  world.formationStepMs = Math.max(140, 800 - world.wave * 60);
  world.enemyFireBaseMs = Math.max(400, 1500 - world.wave * 80);
  world.enemyFireCooldownMs = world.enemyFireBaseMs;
  world.formationLastStepAt = world.nowMs;
  world.formationDir = 1;
}

export function movePlayer(world: World, dx: number): void {
  world.player.x = Math.max(PLAYER_W / 2, Math.min(FIELD_W - PLAYER_W / 2, world.player.x + dx));
}

export function fire(world: World): void {
  if (world.state !== 'playing') return;
  const playerBullets = world.bullets.filter((b) => b.side === 'player').length;
  // Limit concurrent player bullets — base 1, rapid 3, spread always 3.
  const isRapid = world.nowMs < world.rapidUntilMs;
  const isDouble = world.nowMs < world.doubleUntilMs;
  const isSpread = world.shipKind === 'spread';
  const cap = isSpread || isRapid || isDouble ? 4 : (world.shipKind === 'missile' ? 1 : 2);
  if (playerBullets >= cap) return;
  const baseY = PLAYER_Y - PLAYER_H / 2;
  if (world.shipKind === 'spread' || isDouble) {
    // 3 bullets in a spread.
    world.bullets.push({ id: world.nextEntityId++, x: world.player.x - 6, y: baseY, vy: -360, side: 'player' });
    world.bullets.push({ id: world.nextEntityId++, x: world.player.x,     y: baseY, vy: -360, side: 'player' });
    world.bullets.push({ id: world.nextEntityId++, x: world.player.x + 6, y: baseY, vy: -360, side: 'player' });
  } else if (world.shipKind === 'missile') {
    world.bullets.push({ id: world.nextEntityId++, x: world.player.x, y: baseY, vy: -260, side: 'player', damage: 3 });
  } else {
    world.bullets.push({ id: world.nextEntityId++, x: world.player.x, y: baseY, vy: -440, side: 'player' });
  }
}

function bunkerEat(b: Bunker, x: number, y: number): boolean {
  const lx = x - b.x;
  const ly = y - b.y;
  if (lx < 0 || lx >= BUNKER_W || ly < 0 || ly >= BUNKER_H) return false;
  const cellW = BUNKER_W / BUNKER_PIX;
  const cellH = BUNKER_H / BUNKER_PIX;
  const cx = Math.floor(lx / cellW);
  const cy = Math.floor(ly / cellH);
  if (b.cells[cy]?.[cx] === 1) {
    // Erode a small radius (3x3).
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (b.cells[ty] && b.cells[ty]![tx] !== undefined) b.cells[ty]![tx] = 0;
      }
    }
    return true;
  }
  return false;
}

export function tickWorld(world: World, dtMs: number): void {
  if (world.state !== 'playing') return;
  world.nowMs += dtMs;

  // Wave-clear cooldown then spawn next wave.
  if (world.waveClearMs > 0) {
    world.waveClearMs -= dtMs;
    if (world.waveClearMs <= 0) {
      world.wave++;
      spawnWave(world);
    }
    return;
  }

  // Player physics.
  world.player.x = Math.max(PLAYER_W / 2, Math.min(FIELD_W - PLAYER_W / 2, world.player.x + world.player.vx * (dtMs / 1000)));

  // Bullets move.
  for (const b of world.bullets) {
    b.y += b.vy * (dtMs / 1000);
  }
  world.bullets = world.bullets.filter((b) => b.y > -10 && b.y < FIELD_H + 10);

  // Formation step (pause-step pattern).
  if (!world.boss && world.enemies.some((e) => e.alive) && world.nowMs - world.formationLastStepAt >= world.formationStepMs) {
    const aliveCount = world.enemies.filter((e) => e.alive).length;
    const baseStep = 6;
    const speedup = Math.max(0.4, aliveCount / (COLS * ROWS));
    const stepMs = Math.max(80, world.formationStepMs * speedup);
    world.formationLastStepAt = world.nowMs;
    world.formationStepMs = stepMs;
    let edgeHit = false;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const nx = e.x + baseStep * world.formationDir;
      if (nx < 6 || nx > FIELD_W - 6 - ENEMY_W) edgeHit = true;
    }
    if (edgeHit) {
      world.formationDir = (world.formationDir * -1) as 1 | -1;
      for (const e of world.enemies) e.y += 12;
    } else {
      for (const e of world.enemies) e.x += baseStep * world.formationDir;
    }
  }

  // Boss movement + fire.
  if (world.boss) {
    world.boss.x += world.boss.vx * (dtMs / 1000);
    if (world.boss.x < 30 || world.boss.x > FIELD_W - 30) {
      world.boss.vx *= -1;
      world.boss.y += 6;
    }
    world.boss.fireCooldownMs -= dtMs;
    if (world.boss.fireCooldownMs <= 0) {
      world.boss.fireCooldownMs = 600;
      // Triple shot toward player.
      world.bullets.push({ id: world.nextEntityId++, x: world.boss.x - 8, y: world.boss.y + 12, vy: 220, side: 'enemy' });
      world.bullets.push({ id: world.nextEntityId++, x: world.boss.x,     y: world.boss.y + 12, vy: 240, side: 'enemy' });
      world.bullets.push({ id: world.nextEntityId++, x: world.boss.x + 8, y: world.boss.y + 12, vy: 220, side: 'enemy' });
    }
  }

  // Enemy fire.
  if (!world.boss && world.enemies.some((e) => e.alive)) {
    world.enemyFireCooldownMs -= dtMs;
    if (world.enemyFireCooldownMs <= 0) {
      // Pick a random column's bottom-most live enemy.
      const cols = new Map<number, Enemy>();
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const existing = cols.get(e.col);
        if (!existing || e.y > existing.y) cols.set(e.col, e);
      }
      const bottoms = Array.from(cols.values());
      if (bottoms.length > 0) {
        const shooter = bottoms[Math.floor(Math.random() * bottoms.length)]!;
        world.bullets.push({ id: world.nextEntityId++, x: shooter.x + ENEMY_W / 2, y: shooter.y + ENEMY_H, vy: 180, side: 'enemy' });
      }
      world.enemyFireCooldownMs = world.enemyFireBaseMs * (0.6 + Math.random() * 0.8);
    }
  }

  // UFO.
  if (!world.ufo && !world.boss) {
    world.ufoCooldownMs -= dtMs;
    if (world.ufoCooldownMs <= 0) {
      const goingRight = Math.random() < 0.5;
      const drops: PowerUpKind = Math.random() < 0.5 ? 'rapid' : Math.random() < 0.5 ? 'shield' : 'double';
      world.ufo = {
        x: goingRight ? -12 : FIELD_W + 12,
        y: 30,
        vx: goingRight ? 90 : -90,
        hp: 1,
        drops,
      };
      world.ufoCooldownMs = 8000 + Math.random() * 7000;
    }
  }
  if (world.ufo) {
    world.ufo.x += world.ufo.vx * (dtMs / 1000);
    if (world.ufo.x < -20 || world.ufo.x > FIELD_W + 20) world.ufo = null;
  }

  // Power-up drops fall.
  for (const p of world.powerups) p.y += p.vy * (dtMs / 1000);
  world.powerups = world.powerups.filter((p) => p.y < FIELD_H + 10);

  // Player vs powerups.
  for (const p of world.powerups) {
    if (Math.abs(p.x - world.player.x) < PLAYER_W / 2 + 6 && Math.abs(p.y - PLAYER_Y) < PLAYER_H / 2 + 6) {
      applyPowerUp(world, p.kind);
      p.y = FIELD_H + 100; // mark for removal
    }
  }
  world.powerups = world.powerups.filter((p) => p.y < FIELD_H + 10);

  // Bullet-vs-anything collisions.
  for (const b of world.bullets) {
    if (b.side === 'player') {
      // vs enemies
      for (const e of world.enemies) {
        if (!e.alive) continue;
        if (b.x > e.x && b.x < e.x + ENEMY_W && b.y > e.y && b.y < e.y + ENEMY_H) {
          e.alive = false;
          world.score += e.points;
          b.y = -100;
          break;
        }
      }
      // vs UFO
      if (world.ufo && b.x > world.ufo.x - 12 && b.x < world.ufo.x + 12 && b.y > world.ufo.y - 6 && b.y < world.ufo.y + 6) {
        const drop = world.ufo.drops;
        const x = world.ufo.x;
        world.score += 100;
        world.ufo = null;
        world.powerups.push({ id: world.nextEntityId++, x, y: 30, vy: 60, kind: drop });
        b.y = -100;
      }
      // vs boss
      if (world.boss && b.x > world.boss.x - 24 && b.x < world.boss.x + 24 && b.y > world.boss.y - 14 && b.y < world.boss.y + 14) {
        world.boss.hp -= b.damage ?? 1;
        b.y = -100;
        if (world.boss.hp <= 0) {
          world.score += 500 + world.wave * 30;
          world.boss = null;
          world.shake = 1;
          world.waveClearMs = 1200;
        }
      }
      // vs bunker
      for (const bk of world.bunkers) {
        if (bunkerEat(bk, b.x, b.y)) { b.y = -100; break; }
      }
    } else {
      // enemy bullet vs player
      const shielded = world.nowMs < world.shieldUntilMs;
      if (!shielded && Math.abs(b.x - world.player.x) < PLAYER_W / 2 && Math.abs(b.y - PLAYER_Y) < PLAYER_H / 2) {
        b.y = -100;
        world.lives--;
        world.shake = 1;
        world.shieldUntilMs = world.nowMs + 1200; // i-frames
        if (world.lives <= 0) {
          world.state = 'lost';
        }
      }
      // vs bunker
      for (const bk of world.bunkers) {
        if (bunkerEat(bk, b.x, b.y)) { b.y = -100; break; }
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.y > -10 && b.y < FIELD_H + 10);

  // Decay shake.
  world.shake = Math.max(0, world.shake - dtMs / 240);

  // Wave clear?
  if (!world.boss && world.enemies.length > 0 && world.enemies.every((e) => !e.alive)) {
    world.waveClearMs = 900;
    world.score += 50 * world.wave;
  }

  // Enemies reach bunkers => game over.
  for (const e of world.enemies) {
    if (e.alive && e.y + ENEMY_H >= BUNKER_Y) {
      world.state = 'lost';
      break;
    }
  }
}

function applyPowerUp(world: World, kind: PowerUpKind): void {
  if (kind === 'rapid')   world.rapidUntilMs = world.nowMs + 10000;
  if (kind === 'shield')  world.shieldUntilMs = world.nowMs + 6000;
  if (kind === 'double')  world.doubleUntilMs = world.nowMs + 8000;
}

export function aliveEnemyCount(world: World): number {
  return world.enemies.filter((e) => e.alive).length;
}
