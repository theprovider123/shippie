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

/** Pre-shot theater + reactions for the keeper. All optional — omit for the old static pose. */
export interface KeeperPose {
  /** Millisecond clock (e.g. rAF timestamp) driving idle sway/bounce/breathing. */
  t?: number;
  /** -1..1: where the head + eyes look across the goal (the ball or the aim point). */
  headTrack?: number;
  /** Pre-shot mind-game gesture. */
  gesture?: "none" | "starfish" | "point" | "clap";
  /** Side a "point" gesture calls (-1 left, 1 right). */
  pointDir?: -1 | 1;
  /** Post-shot reaction: arms-up celebration on a save, slump on a goal conceded. */
  react?: "save" | "concede" | null;
  /** 0..1 progress of the reaction. */
  reactT?: number;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Human goalkeeper: knees-bent ready stance with idle weight-shift sway and a
 * subtle bounce on the line, articulated shoulder→elbow→glove arms, a head that
 * tracks the ball/aim point, full-stretch dives with a leading arm + trailing
 * leg, and pre-shot theater (starfish wobble, pointing, glove claps) plus
 * save celebrations / concede slumps via `pose`. First-person penalty view —
 * `reachPx` is save half-width; `scale` ≈ half of goal height. Amber kit by
 * default so the keeper reads as the opponent. Pure Canvas2D, no assets.
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
  pose?: KeeperPose,
): void {
  const dark = "#1a1208";
  const gloveCol = "#fff7e6";
  const skin = "#e8c9a0";
  const shirtNum = "#1a1208";
  const bootCol = "#111";
  const shinCol = "#ddd";

  const t = pose?.t ?? 0;
  const headTrack = Math.max(-1, Math.min(1, pose?.headTrack ?? 0));
  const gesture = pose?.gesture ?? "none";
  const pointDir = pose?.pointDir ?? 1;
  const react = pose?.react ?? null;
  const reactT = clamp01(pose?.reactT ?? 0);
  const idle = dive < 0.04 && !react;

  // unit = consistent sizing denominator
  const u = scale * 0.18;
  const bodyW = u * 1.4;
  const bodyH = u * 2.1;
  const headR = u * 0.82;
  const shoulderY = -bodyH * 0.36;
  const hipY = bodyH * 0.24;
  const dir = lean === 0 ? 0 : lean > 0 ? 1 : -1;

  // Idle life: weight shift sway + a soft bounce off the toes.
  const sway = idle ? Math.sin(t / 560) : 0;
  const bounce = idle ? Math.abs(Math.sin(t / 300)) : 0;

  ctx.save();
  // Dive: arc off the line toward dive direction. Idle: sway + bounce.
  // React: hop on a save, sink on a concede.
  ctx.translate(
    cx + dir * dive * scale * 0.28 + sway * u * 0.4,
    cy -
      Math.sin(dive * Math.PI) * scale * 0.38 -
      bounce * u * 0.16 +
      (react === "concede" ? reactT * u * 0.55 : 0) -
      (react === "save" ? Math.sin(reactT * Math.PI) * u * 0.9 : 0),
  );
  ctx.rotate(lean * 0.22 + dir * dive * (Math.PI * 0.38) + sway * 0.05);

  // — LEGS + BOOTS —
  const legW = Math.max(5, u * 0.56);
  const leg = (
    hx: number, hy: number,
    kx: number, ky: number,
    fx: number, fy: number,
  ): void => {
    ctx.strokeStyle = dark;
    ctx.lineWidth = legW;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(kx, ky, fx, fy);
    ctx.stroke();
    // Shin pad: bright stripe down the shin (knee→foot)
    ctx.strokeStyle = shinCol;
    ctx.lineWidth = legW * 0.42;
    ctx.beginPath();
    ctx.moveTo(kx + (fx - kx) * 0.25, ky + (fy - ky) * 0.25);
    ctx.lineTo(kx + (fx - kx) * 0.7, ky + (fy - ky) * 0.7);
    ctx.stroke();
    ctx.fillStyle = bootCol;
    ctx.beginPath();
    ctx.ellipse(fx, fy, u * 0.36, u * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (dive > 0.04) {
    // Full extension: leading leg drives long, trailing leg tucks behind.
    const d = dir || 1;
    leg(d * bodyW * 0.18, hipY, d * bodyW * 0.45, hipY + u * 0.5, d * (bodyW * 0.3 + dive * u * 0.5), hipY + u * (1.3 - dive * 0.15));
    leg(-d * bodyW * 0.18, hipY, -d * (bodyW * 0.3 + dive * u * 0.4), hipY + u * 0.75, -d * (bodyW * 0.34 + dive * u * 1.0), hipY + u * 1.45);
  } else {
    // Ready stance: knees bent out, feet planted under, weight shifting with sway.
    const step = sway * u * 0.16;
    leg(-bodyW * 0.22, hipY, -bodyW * 0.52, hipY + u * 0.6, -bodyW * 0.36 + step, hipY + u * 1.18 - Math.max(0, sway) * u * 0.08);
    leg(bodyW * 0.22, hipY, bodyW * 0.52, hipY + u * 0.6, bodyW * 0.36 + step, hipY + u * 1.18 - Math.max(0, -sway) * u * 0.08);
  }

  // — TORSO (jersey) — crouched a touch deeper when idle (ready stance)
  const crouch = idle ? u * 0.12 : 0;
  ctx.fillStyle = kit;
  rr(ctx, -bodyW / 2, shoulderY - u * 0.1 + crouch, bodyW, bodyH * 0.56, u * 0.32);
  // Jersey number "1"
  ctx.fillStyle = shirtNum;
  ctx.font = `bold ${u * 0.72}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1", 0, shoulderY + bodyH * 0.18 + crouch);

  // — ARMS (shoulder → elbow → glove, articulated per pose) —
  const armLen = Math.max(reachPx * 0.72, bodyW * 0.9);
  const armRaiseY = shoulderY - u * 0.28;
  const hands: { x: number; y: number }[] = [];
  ctx.strokeStyle = kit;
  ctx.lineWidth = Math.max(5, u * 0.62);
  ctx.lineCap = "round";
  for (const s of [-1, 1] as const) {
    const sx = s * bodyW * 0.42;
    const sy = shoulderY + crouch;
    let ex: number, ey: number, hx: number, hy: number;
    if (dive > 0.04) {
      if (s === (dir || 1)) {
        // Leading arm: full stretch toward the corner.
        ex = s * armLen * 0.5; ey = armRaiseY - u * 0.55;
        hx = s * armLen * 1.08; hy = armRaiseY - u * (0.3 + dive * 0.9);
      } else {
        // Trailing arm: across the body, lower.
        ex = s * armLen * 0.3; ey = armRaiseY + u * 0.35;
        hx = s * armLen * 0.45; hy = armRaiseY + u * 0.95;
      }
    } else if (react === "save") {
      // Both fists pumped to the sky.
      ex = s * armLen * 0.42; ey = shoulderY - u * 0.4;
      hx = s * armLen * 0.55; hy = shoulderY - u * (1.1 + reactT * 0.6);
    } else if (react === "concede") {
      // Slump: arms hang dead at the sides.
      ex = s * armLen * 0.38; ey = shoulderY + u * 0.7;
      hx = s * armLen * 0.3; hy = hipY + u * (0.7 + reactT * 0.35);
    } else if (gesture === "starfish") {
      // Arms wide, wobbling — "look how big I am".
      const wob = Math.sin(t / 110 + s) * u * 0.2;
      ex = s * armLen * 0.5; ey = armRaiseY - u * 0.35;
      hx = s * armLen * 1.05; hy = armRaiseY - u * 0.1 + wob;
    } else if (gesture === "point" && s === pointDir) {
      // Point/stare at one side of the goal.
      ex = s * armLen * 0.55; ey = shoulderY - u * 0.35;
      hx = s * armLen * 1.15; hy = shoulderY - u * 0.45;
    } else if (gesture === "clap") {
      // Two quick glove claps in front of the chest.
      const open = (Math.sin(t / 120) + 1) / 2;
      ex = s * armLen * 0.45; ey = shoulderY + u * 0.5;
      hx = s * (u * 0.28 + open * u * 0.55); hy = shoulderY + u * 0.55;
    } else {
      // Ready stance: elbows out, gloves forward at waist height, breathing.
      const breathe = Math.sin(t / 430 + s) * u * 0.07;
      ex = s * armLen * 0.58; ey = shoulderY + u * 0.22 + crouch;
      hx = s * armLen * 0.62; hy = shoulderY + u * 1.0 + breathe + crouch;
    }
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(ex, ey, hx, hy);
    ctx.stroke();
    hands.push({ x: hx, y: hy });
  }
  // Gloves with wristband + finger lines
  const gloveR = Math.max(u * 0.44, scale * 0.072);
  for (const h of hands) {
    ctx.fillStyle = "#e8b84b"; // wristband
    ctx.beginPath(); ctx.arc(h.x, h.y, gloveR * 1.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = gloveCol;
    ctx.beginPath(); ctx.arc(h.x, h.y, gloveR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = Math.max(1, u * 0.1);
    for (let i = -1; i <= 1; i++) {
      const gx = h.x + i * gloveR * 0.38, gy = h.y - gloveR * 0.5;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gloveR * 0.8); ctx.stroke();
    }
  }

  // — HEAD — tracks the ball/aim point; drops on a concede
  const headCX = headTrack * headR * 0.42 + (dive > 0.04 ? (dir || 1) * dive * headR * 0.3 : sway * headR * 0.12);
  const headCY = shoulderY - headR * 0.8 + crouch + (react === "concede" ? reactT * headR * 0.5 : 0);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();
  // Hair (dark cap on top half)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, Math.PI, Math.PI * 2);
  ctx.fill();
  // Cap peak swings with the gaze
  ctx.fillStyle = "#c47a1a";
  const peakDir = headTrack >= 0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(headCX - peakDir * headR * 0.7, headCY);
  ctx.lineTo(headCX + peakDir * headR * 0.7, headCY);
  ctx.lineTo(headCX + peakDir * headR * 1.1, headCY + headR * 0.15);
  ctx.lineTo(headCX - peakDir * headR * 0.7, headCY + headR * 0.15);
  ctx.closePath();
  ctx.fill();
  // Eyes shift toward the tracked point
  const eyeShift = headTrack * headR * 0.16;
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(headCX - headR * 0.3 + eyeShift, headCY + headR * 0.08, headR * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headCX + headR * 0.3 + eyeShift, headCY + headR * 0.08, headR * 0.12, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
