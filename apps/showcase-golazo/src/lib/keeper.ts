// One believable goalkeeper, shared by every shooting game. It anticipates, commits
// to a dive with reach + error scaled by a difficulty knob, and can be ramped harder
// as the player scores. Pure-ish: keeperConfig + saved() are testable; Keeper holds
// the per-frame animation state the games render however they like.

export interface KeeperConfig {
  /** Save zone half-width, as a fraction of goal width. Bigger = harder to beat. */
  reach: number;
  /** Dive guess error, as a fraction of goal width. Smaller = sharper keeper. */
  error: number;
  /** Lerp factor toward the dive target (0..1). Higher = quicker dive. */
  speed: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Difficulty 0 (flap) → 1 (world class). Casual ≈ 0.3, Pro ≈ 0.75. */
export function keeperConfig(difficulty: number): KeeperConfig {
  const d = clamp(difficulty, 0, 1);
  return {
    reach: 0.12 + d * 0.17, // 0.12 → 0.29 of the goal
    error: 0.52 - d * 0.44, // 0.52 → 0.08 of the goal
    speed: 0.14 + d * 0.12,
  };
}

/** Did the keeper get there? Pure, for tests + judging. */
export function saved(ballX: number, keeperX: number, reachPx: number, ballR: number): boolean {
  return Math.abs(ballX - keeperX) < reachPx + ballR;
}

/** Dynamic difficulty: harder the more you've scored, capped. */
export function rampedDifficulty(base: number, score: number, perGoal = 0.05, cap = 0.92): number {
  return clamp(base + score * perGoal, 0, cap);
}

/** Animated keeper position between two goalposts. Games render it themselves. */
export class Keeper {
  x: number;
  target: number;
  lean = 0;
  diving = false;
  private patrolDir = 1;

  constructor(private x0: number, private x1: number, public cfg: KeeperConfig) {
    this.x = (x0 + x1) / 2;
    this.target = this.x;
  }

  setBounds(x0: number, x1: number): void {
    this.x0 = x0; this.x1 = x1;
  }

  /** Commit a dive toward where the ball will cross, with difficulty-scaled error. */
  commit(predictedCrossX: number, rng: () => number = Math.random): void {
    const goalW = this.x1 - this.x0;
    const err = (rng() - 0.5) * goalW * this.cfg.error * 2;
    this.target = clamp(predictedCrossX + err, this.x0, this.x1);
    this.diving = true;
  }

  /** Commit to a fixed zone centre (for keeper-vs-striker games where the side is chosen). */
  commitZone(dir: -1 | 0 | 1): void {
    const goalW = this.x1 - this.x0;
    const mid = (this.x0 + this.x1) / 2;
    this.target = dir === 0 ? mid : mid + dir * goalW * 0.3;
    this.diving = true;
  }

  /** Per-frame update. When idle (no dive committed), patrol the line. */
  update(idleSpeed = 2): void {
    if (this.diving) {
      this.x += (this.target - this.x) * (this.cfg.speed + 0.04);
      const mid = (this.x0 + this.x1) / 2;
      this.lean += (clamp((this.target - mid) / ((this.x1 - this.x0) / 2), -1, 1) - this.lean) * 0.2;
    } else {
      this.x += this.patrolDir * idleSpeed;
      const reachPx = this.reachPx();
      if (this.x < this.x0 + reachPx) this.patrolDir = 1;
      if (this.x > this.x1 - reachPx) this.patrolDir = -1;
      this.lean += (0 - this.lean) * 0.2;
    }
  }

  reachPx(): number {
    return (this.x1 - this.x0) * this.cfg.reach;
  }

  reset(): void {
    this.x = (this.x0 + this.x1) / 2;
    this.target = this.x;
    this.diving = false;
    this.lean = 0;
  }
}
