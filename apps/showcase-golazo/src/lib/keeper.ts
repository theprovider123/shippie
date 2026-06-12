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
  /** Frames the keeper hesitates before committing the dive (human reaction). */
  reactionFrames: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Difficulty 0 (flap) → 1 (world class). Casual ≈ 0.3, Pro ≈ 0.75.
 * Tuned to feel HUMAN: a keeper can't cover the whole goal (reach tops out at
 * ~a quarter of it), always guesses with some error, and reacts a beat late —
 * so power, placement and curl genuinely beat them.
 */
export function keeperConfig(difficulty: number): KeeperConfig {
  const d = clamp(difficulty, 0, 1);
  return {
    reach: 0.1 + d * 0.13, // 0.10 → 0.23 of the goal (corners always live)
    error: 0.6 - d * 0.36, // 0.60 → 0.24 of the goal (never psychic)
    speed: 0.12 + d * 0.1, // a touch slower than before
    reactionFrames: Math.round(13 - d * 7), // 13 → 6 frames of hesitation
  };
}

/** Did the keeper get there? Pure, for tests + judging. */
export function saved(ballX: number, keeperX: number, reachPx: number, ballR: number): boolean {
  return Math.abs(ballX - keeperX) < reachPx + ballR;
}

/** 2D save envelope for shots where height matters: free kicks, top corners, dips. */
export function saved2d(
  ballX: number,
  ballY: number,
  keeperX: number,
  keeperY: number,
  reachX: number,
  reachY: number,
  ballR: number,
): boolean {
  const dx = (ballX - keeperX) / Math.max(1, reachX + ballR);
  const dy = (ballY - keeperY) / Math.max(1, reachY + ballR * 0.7);
  return dx * dx + dy * dy <= 1;
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
  /** 0 = on the line, 1 = full-stretch airborne dive. Drives the dive animation. */
  dive = 0;
  /** Pre-shot drift direction: -1 left, 0 centre, 1 right. Set by prepareRound(). */
  preDriftDir = 0;
  /** Whether the keeper will snap back the other way (feint) on dive commit. */
  preDriftFake = false;
  private patrolDir = 1;
  private wait = 0; // reaction-delay frames remaining before the dive commits

  constructor(private x0: number, private x1: number, public cfg: KeeperConfig) {
    this.x = (x0 + x1) / 2;
    this.target = this.x;
  }

  setBounds(x0: number, x1: number): void {
    this.x0 = x0; this.x1 = x1;
  }

  /** Call before each round. Sets the keeper's pre-shot preference for mind games. */
  prepareRound(rng: () => number = Math.random): void {
    this.preDriftDir = rng() < 0.4 ? 0 : rng() < 0.5 ? -1 : 1;
    this.preDriftFake = this.preDriftDir !== 0 && rng() < 0.3;
  }

  /** Commit a dive toward where the ball will cross, with difficulty-scaled error.
   *  The keeper hesitates `reactionFrames` before actually moving — so a fast,
   *  well-placed shot can be in before they get across. */
  commit(predictedCrossX: number, rng: () => number = Math.random): void {
    const goalW = this.x1 - this.x0;
    const err = (rng() - 0.5) * goalW * this.cfg.error * 2;
    this.target = clamp(predictedCrossX + err, this.x0, this.x1);
    this.diving = true;
    this.wait = this.cfg.reactionFrames ?? 0;
  }

  /** Commit to a fixed zone centre (for keeper-vs-striker games where the side is chosen). */
  commitZone(dir: -1 | 0 | 1): void {
    const goalW = this.x1 - this.x0;
    const mid = (this.x0 + this.x1) / 2;
    this.target = dir === 0 ? mid : mid + dir * goalW * 0.3;
    this.diving = true;
    this.wait = this.cfg.reactionFrames ?? 0;
  }

  /** Per-frame update. When idle (no dive committed), patrol the line. */
  update(idleSpeed = 2): void {
    if (this.diving) {
      // Hesitate first: only a small anticipatory shift, then explode into the dive.
      const committed = this.wait <= 0;
      const factor = committed ? this.cfg.speed + 0.04 : (this.cfg.speed + 0.04) * 0.18;
      if (this.wait > 0) this.wait--;
      this.x += (this.target - this.x) * factor;
      const mid = (this.x0 + this.x1) / 2;
      this.lean += (clamp((this.target - mid) / ((this.x1 - this.x0) / 2), -1, 1) - this.lean) * 0.2;
      // Once committed, launch off the line into a full-stretch dive.
      if (committed) this.dive += (1 - this.dive) * 0.22;
    } else {
      this.x += this.patrolDir * idleSpeed;
      const reachPx = this.reachPx();
      if (this.x < this.x0 + reachPx) this.patrolDir = 1;
      if (this.x > this.x1 - reachPx) this.patrolDir = -1;
      this.lean += (0 - this.lean) * 0.2;
      this.dive += (0 - this.dive) * 0.3;
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
    this.dive = 0;
    this.preDriftDir = 0;
    this.preDriftFake = false;
    this.wait = 0;
  }
}
