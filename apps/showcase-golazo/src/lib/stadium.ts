// Shared canvas toolkit so every Golazo game shares one "almost real, still simple"
// look: a layered stadium backdrop, a height-aware ball shadow, a shaded spinning
// ball with a motion trail, a tiny particle system, and screen-shake. Pure Canvas2D,
// no image assets (offline), 60fps-minded.

export type Markings = "none" | "goal" | "penalty";

export interface StadiumOpts {
  /** Fraction of height where the pitch starts (0..1). Default 0.5. */
  pitchTop?: number;
  markings?: Markings;
  /** Accent for floodlight tint. Default Golazo green. */
  accent?: string;
}

/** Deterministic 0..1 from an integer — for stable crowd speckle. */
function rand(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function drawStadium(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  opts: StadiumOpts = {},
): void {
  const pitchTop = (opts.pitchTop ?? 0.5) * H;
  const accent = opts.accent ?? "#16f08b";

  // Night sky
  const sky = ctx.createLinearGradient(0, 0, 0, pitchTop);
  sky.addColorStop(0, "#06121f");
  sky.addColorStop(1, "#0a1c14");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, pitchTop);

  // Crowd band — speckled stand just above the pitch
  const bandH = pitchTop * 0.42;
  const bandY = pitchTop - bandH;
  ctx.fillStyle = "#0b1622";
  ctx.fillRect(0, bandY, W, bandH);
  const cols = ["#1b2a3a", "#23323f", "#2a2030", "#1e2c24", "#322a1c"];
  const step = Math.max(7, W / 90);
  for (let y = bandY + 4; y < pitchTop - 2; y += step) {
    for (let x = 2; x < W; x += step) {
      const n = (x * 7.3 + y * 13.1) | 0;
      if (rand(n) > 0.45) {
        ctx.fillStyle = cols[(n + Math.floor(rand(n) * 5)) % cols.length];
        ctx.globalAlpha = 0.5 + rand(n + 1) * 0.4;
        ctx.fillRect(x, y, step * 0.55, step * 0.55);
      }
    }
  }
  ctx.globalAlpha = 1;

  // Floodlight cones from the top corners — gentle pulse
  const pulse = 0.5 + Math.sin(t / 1400) * 0.08;
  for (const cx of [W * 0.18, W * 0.82]) {
    const g = ctx.createRadialGradient(cx, -H * 0.1, 0, cx, pitchTop * 0.6, W * 0.7);
    g.addColorStop(0, hexA(cx < W / 2 ? "#9fc6ff" : accent, 0.1 * pulse));
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, pitchTop);
  }

  // Pitch with perspective stripes
  const pitch = ctx.createLinearGradient(0, pitchTop, 0, H);
  pitch.addColorStop(0, "#13361f");
  pitch.addColorStop(1, "#0a2114");
  ctx.fillStyle = pitch;
  ctx.fillRect(0, pitchTop, W, H - pitchTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, pitchTop, W, H - pitchTop);
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) continue;
    const y0 = pitchTop + ((H - pitchTop) * i) / 9;
    const y1 = pitchTop + ((H - pitchTop) * (i + 1)) / 9;
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fillRect(0, y0, W, y1 - y0);
  }
  if (opts.markings && opts.markings !== "none") drawMarkings(ctx, W, H, pitchTop, opts.markings);
  ctx.restore();
}

function drawMarkings(ctx: CanvasRenderingContext2D, W: number, H: number, pitchTop: number, m: Markings): void {
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  if (m === "penalty") {
    // penalty arc + spot near the top of the pitch
    const cx = W / 2;
    const arcY = pitchTop + (H - pitchTop) * 0.16;
    ctx.beginPath();
    ctx.arc(cx, arcY, W * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(cx, pitchTop + (H - pitchTop) * 0.05, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Ball with radial shading, a hint of pentagon, and rotation. */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin = 0, squash = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / squash, squash); // squash & stretch (volume-preserving-ish)
  ctx.rotate(spin);
  const g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.15, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.7, "#eef2f6");
  g.addColorStop(1, "#b9c4cf");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // pentagon-ish dark patches for spin readability
  ctx.fillStyle = "rgba(10,14,26,0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Soft contact shadow that shrinks + fades as the ball rises (heightFrac 0=ground,1=high). */
export function drawBallShadow(ctx: CanvasRenderingContext2D, x: number, groundY: number, r: number, heightFrac: number): void {
  const k = Math.max(0, Math.min(1, heightFrac));
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.32 * (1 - k * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY, r * (1.15 - k * 0.5), r * (0.32 - k * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Fading motion trail behind a moving ball. */
export class Trail {
  private pts: { x: number; y: number }[] = [];
  constructor(private max = 8) {}
  push(x: number, y: number): void {
    this.pts.push({ x, y });
    if (this.pts.length > this.max) this.pts.shift();
  }
  clear(): void {
    this.pts = [];
  }
  draw(ctx: CanvasRenderingContext2D, r: number, color = "rgba(255,255,255,"): void {
    this.pts.forEach((p, i) => {
      const a = (i / this.pts.length) * 0.35;
      ctx.fillStyle = `${color}${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (0.4 + (i / this.pts.length) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string;
}

/** Tiny particle system for dust puffs + goal sparks. */
export class Particles {
  private items: Particle[] = [];
  emit(x: number, y: number, kind: "dust" | "spark", count = 10): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === "spark" ? 2 + Math.random() * 5 : 0.5 + Math.random() * 2;
      this.items.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === "spark" ? 1 : 0.5),
        life: 0,
        max: kind === "spark" ? 40 + Math.random() * 30 : 24 + Math.random() * 16,
        r: kind === "spark" ? 2 + Math.random() * 2 : 2 + Math.random() * 3,
        color: kind === "spark"
          ? ["#ffd34d", "#16f08b", "#ffffff"][Math.floor(Math.random() * 3)]
          : "rgba(200,210,200,0.5)",
      });
    }
  }
  update(): void {
    for (const p of this.items) {
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
    }
    this.items = this.items.filter((p) => p.life < p.max);
  }
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  get count(): number {
    return this.items.length;
  }
}

/** A decaying screen-shake. Call kick() on impact, read offset() each frame. */
export class Shake {
  private mag = 0;
  kick(m: number): void {
    this.mag = Math.max(this.mag, m);
  }
  offset(): [number, number] {
    if (this.mag < 0.2) return [0, 0];
    const dx = (Math.random() - 0.5) * this.mag;
    const dy = (Math.random() - 0.5) * this.mag;
    this.mag *= 0.86;
    return [dx, dy];
  }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
  ctx.fill();
}

/**
 * Detailed goalkeeper: cap, eyes, jersey number "1", wristband gloves with finger lines,
 * shin pads and boots. First-person penalty view — keeper appears small relative to the
 * full-width goal. `reachPx` is save half-width; `scale` ≈ 44% of goal height.
 * Amber kit by default so the keeper reads as the opponent.
 */
export function drawKeeper(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  reachPx: number,
  lean: number,
  scale: number,
  dive = 0,
  kit = "#f5a623",
): void {
  const dark = "#1a1208";
  const gloveCol = "#fff7e6";
  const skin = "#e8c9a0";
  const shirtNum = "#1a1208";
  const bootCol = "#111";
  const shinCol = "#ddd";

  // unit = consistent sizing denominator
  const u = scale * 0.18;
  const bodyW = u * 1.4;
  const bodyH = u * 2.1;
  const headR = u * 0.82;
  const shoulderY = -bodyH * 0.36;
  const hipY = bodyH * 0.24;
  const dir = lean === 0 ? 0 : lean > 0 ? 1 : -1;

  ctx.save();
  // Dive: arc off the line toward dive direction
  ctx.translate(
    cx + dir * dive * scale * 0.28,
    cy - Math.sin(dive * Math.PI) * scale * 0.38,
  );
  ctx.rotate(lean * 0.22 + dir * dive * (Math.PI * 0.38));

  // — LEGS + BOOTS —
  ctx.fillStyle = dark;
  rr(ctx, -bodyW * 0.42, hipY, bodyW * 0.33, u * 1.4, u * 0.18);
  rr(ctx, bodyW * 0.09, hipY, bodyW * 0.33, u * 1.4, u * 0.18);
  // Shin pads (white stripe on each leg)
  ctx.fillStyle = shinCol;
  ctx.fillRect(-bodyW * 0.36, hipY + u * 0.3, bodyW * 0.2, u * 0.55);
  ctx.fillRect(bodyW * 0.16, hipY + u * 0.3, bodyW * 0.2, u * 0.55);
  // Boots
  ctx.fillStyle = bootCol;
  ctx.beginPath(); ctx.ellipse(-bodyW * 0.26, hipY + u * 1.42, u * 0.38, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(bodyW * 0.26, hipY + u * 1.42, u * 0.38, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  // — TORSO (jersey) —
  ctx.fillStyle = kit;
  rr(ctx, -bodyW / 2, shoulderY - u * 0.1, bodyW, bodyH * 0.56, u * 0.32);
  // Jersey number "1"
  ctx.fillStyle = shirtNum;
  ctx.font = `bold ${u * 0.72}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1", 0, shoulderY + bodyH * 0.18);

  // — ARMS (quadratic curves for natural bend) —
  const actualArmLen = Math.max(reachPx * 0.72, bodyW * 0.9);
  const armRaiseY = shoulderY - u * 0.28;
  ctx.strokeStyle = kit;
  ctx.lineWidth = Math.max(5, u * 0.62);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.42, shoulderY);
  ctx.quadraticCurveTo(-actualArmLen * 0.55, armRaiseY - u * 0.2, -actualArmLen, armRaiseY);
  ctx.moveTo(bodyW * 0.42, shoulderY);
  ctx.quadraticCurveTo(actualArmLen * 0.55, armRaiseY - u * 0.2, actualArmLen, armRaiseY);
  ctx.stroke();
  // Gloves with wristband
  const gloveR = Math.max(u * 0.44, scale * 0.072);
  ctx.fillStyle = "#e8b84b"; // wristband
  ctx.beginPath(); ctx.arc(-actualArmLen, armRaiseY, gloveR * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(actualArmLen, armRaiseY, gloveR * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gloveCol;
  ctx.beginPath(); ctx.arc(-actualArmLen, armRaiseY, gloveR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(actualArmLen, armRaiseY, gloveR, 0, Math.PI * 2); ctx.fill();
  // Glove fingers (3 lines)
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(1, u * 0.1);
  for (let i = -1; i <= 1; i++) {
    const gx1 = -actualArmLen + i * gloveR * 0.38, gy1 = armRaiseY - gloveR * 0.5;
    ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx1, gy1 + gloveR * 0.8); ctx.stroke();
    const gx2 = actualArmLen + i * gloveR * 0.38;
    ctx.beginPath(); ctx.moveTo(gx2, gy1); ctx.lineTo(gx2, gy1 + gloveR * 0.8); ctx.stroke();
  }

  // — HEAD —
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, shoulderY - headR * 0.8, headR, 0, Math.PI * 2);
  ctx.fill();
  // Hair (dark cap on top half)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, shoulderY - headR * 0.8, headR, Math.PI, Math.PI * 2);
  ctx.fill();
  // Cap peak
  ctx.fillStyle = "#c47a1a";
  ctx.beginPath();
  ctx.moveTo(-headR * 0.7, shoulderY - headR * 0.8);
  ctx.lineTo(headR * 0.7, shoulderY - headR * 0.8);
  ctx.lineTo(headR * 1.1, shoulderY - headR * 0.65);
  ctx.lineTo(-headR * 0.7, shoulderY - headR * 0.65);
  ctx.closePath();
  ctx.fill();
  // Eyes
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(-headR * 0.3, shoulderY - headR * 0.72, headR * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headR * 0.3, shoulderY - headR * 0.72, headR * 0.12, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
