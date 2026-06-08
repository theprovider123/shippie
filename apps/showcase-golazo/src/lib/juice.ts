// Game-feel layer shared by the Golazo games. Sits on top of the existing Particles/Shake/
// Trail primitives in stadium.ts. The Hitstop math is pure + tested; the draw helpers are
// thin Canvas2D calls. Nothing here owns state beyond its own instance.

function clamp01(n: number): number {
  return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Slow-motion / freeze-frame controller. Call `kick(strength, hold)` on a big moment
 * (goal, save), then multiply your fixed physics step by `scale()` each frame. It hard-
 * freezes for `hold` frames, then eases the time-scale back up to 1. Because it returns a
 * *time scale* (not a changed step count) the underlying physics stays deterministic.
 */
export class Hitstop {
  private freeze = 0; // 0..1 residual slow-mo energy
  private hold = 0; // frames of near-total freeze remaining

  /** strength 0..1 (clamped), hold = frames of hard freeze. */
  kick(strength = 0.8, hold = 3): void {
    this.freeze = Math.max(this.freeze, clamp01(strength));
    this.hold = Math.max(this.hold, Math.max(0, Math.floor(hold)));
  }

  /** Per-frame: advances decay and returns the time scale to apply (0..1). */
  scale(): number {
    if (this.hold > 0) {
      this.hold--;
      return 0.04;
    }
    if (this.freeze < 0.02) {
      this.freeze = 0;
      return 1;
    }
    const s = 1 - this.freeze * 0.85; // deepest slow-mo right after the freeze
    this.freeze *= 0.86;
    return s < 0 ? 0 : s > 1 ? 1 : s;
  }

  get active(): boolean {
    return this.hold > 0 || this.freeze >= 0.02;
  }

  reset(): void {
    this.freeze = 0;
    this.hold = 0;
  }
}

/** A decaying ripple in the net where the ball hit — call with a rising `age` (frames). */
export function drawNetRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  age: number,
  color = "rgba(255,255,255,",
): void {
  if (age < 0 || age > 26) return;
  const k = age / 26;
  ctx.save();
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const r = 6 + k * 42 + i * 9;
    const a = Math.max(0, (1 - k) * 0.5 - i * 0.12);
    ctx.strokeStyle = `${color}${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
