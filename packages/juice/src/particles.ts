/**
 * Canvas-based particle system. Mounts onto a host canvas; emits
 * bursts on demand; auto-cleans dead particles each frame.
 *
 *   const fx = new Particles(canvas);
 *   fx.start();
 *   fx.emit({ x: 100, y: 100, count: 12, colour: '#E84A2D', kind: 'burst' });
 *
 * Three kinds:
 *   - 'burst'    — radial scatter; gravity-pulled. Use for matches /
 *                  pops / explosions.
 *   - 'rain'     — vertical scatter from above; slow descent. Use for
 *                  confetti / win celebrations.
 *   - 'shatter'  — directional spray; faster decay. Use for tile
 *                  break / wall destruction.
 */

export type ParticleKind = 'burst' | 'rain' | 'shatter';

export interface ParticleEmit {
  x: number;
  y: number;
  /** Particles to spawn (default 8). */
  count?: number;
  /** CSS colour string (or array — random pick per particle). */
  colour?: string | string[];
  kind?: ParticleKind;
  /** Optional initial speed multiplier (default 1). */
  speed?: number;
  /** Particle lifetime in ms (default 800). */
  lifetimeMs?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  colour: string;
  age: number;
  life: number;
  gravity: number;
}

export class Particles {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private raf = 0;
  private last = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.particles = [];
    this.clear();
  }

  emit(spec: ParticleEmit): void {
    const count = spec.count ?? 8;
    const colour = spec.colour ?? '#fff';
    const speed = spec.speed ?? 1;
    const life = spec.lifetimeMs ?? 800;
    const kind = spec.kind ?? 'burst';
    for (let i = 0; i < count; i++) {
      const c = Array.isArray(colour) ? colour[i % colour.length]! : colour;
      let vx = 0, vy = 0, gravity = 0;
      if (kind === 'burst') {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const v = (40 + Math.random() * 80) * speed;
        vx = Math.cos(angle) * v;
        vy = Math.sin(angle) * v;
        gravity = 240;
      } else if (kind === 'rain') {
        vx = (Math.random() - 0.5) * 40 * speed;
        vy = (50 + Math.random() * 80) * speed;
        gravity = 80;
      } else {
        // shatter: hemispheric upward spray
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
        const v = (60 + Math.random() * 100) * speed;
        vx = Math.cos(angle) * v;
        vy = Math.sin(angle) * v;
        gravity = 420;
      }
      this.particles.push({
        x: spec.x,
        y: spec.y,
        vx,
        vy,
        size: 3 + Math.random() * 3,
        colour: c,
        age: 0,
        life: life * (0.7 + Math.random() * 0.6),
        gravity,
      });
    }
  }

  /** Resize canvas backing store to its CSS box (incl. DPR). */
  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio ?? 1);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private tick(dt: number): void {
    const surviving: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt * 1000;
      if (p.age >= p.life) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      surviving.push(p);
    }
    this.particles = surviving;
  }

  private draw(): void {
    if (!this.ctx) return;
    this.clear();
    for (const p of this.particles) {
      const alpha = 1 - p.age / p.life;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.colour;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  private clear(): void {
    if (!this.ctx) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, w, h);
  }
}
