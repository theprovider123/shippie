import { useEffect, useRef } from 'react';

const PARTICLE_CAP = 60;
const DURATION_MS = 200;
const COLORS = ['#C9A24B', '#F2E5C1', '#1B7A52', '#0E5C3A', '#A9362E'];

/**
 * Fanfare — poll-close celebration.
 *
 * When the `trigger` value changes (truthy), fire a single 200ms confetti
 * burst (max 60 particles), flash the scoreboard via a CSS class, and emit
 * one short haptic tick. Respects `prefers-reduced-motion` — falls back to
 * a static colored flash with no particles or vibration.
 *
 * Pure side-effect component. Renders an absolutely-positioned canvas
 * sized to the viewport; safe to mount once at the app root.
 */
export function Fanfare(props: {
  /** Distinct value per "moment" — burst fires whenever this changes. */
  trigger: string | number | null;
  /** Optional tone color override for the scoreboard flash. */
  tone?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTrigger = useRef<string | number | null>(null);

  useEffect(() => {
    if (props.trigger == null) return;
    if (props.trigger === lastTrigger.current) return;
    lastTrigger.current = props.trigger;

    const reduceMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    flashScoreboard(props.tone ?? '#C9A24B', reduceMotion);

    if (reduceMotion) return;

    // Single short haptic tick — guarded so non-vibrating devices stay quiet.
    try {
      navigator.vibrate?.(40);
    } catch {
      // best-effort
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    runConfettiBurst(canvas);
  }, [props.trigger, props.tone]);

  return (
    <canvas
      ref={canvasRef}
      className="fanfare-canvas"
      data-testid="fanfare-canvas"
      aria-hidden
    />
  );
}

function flashScoreboard(tone: string, reduceMotion: boolean) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>('[data-testid="hero-scoreboard"]');
  if (!el) return;
  el.style.setProperty('--fanfare-tone', tone);
  el.classList.add('is-fanfare');
  // Even with reduced motion we still flash — short, no particle storm.
  window.setTimeout(() => {
    el.classList.remove('is-fanfare');
  }, reduceMotion ? 320 : DURATION_MS);
}

function runConfettiBurst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: PARTICLE_CAP }, () => makeParticle(w, h));
  const start = performance.now();

  const step = (t: number) => {
    const elapsed = t - start;
    if (elapsed > DURATION_MS * 3.5) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.32;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
}

function makeParticle(w: number, h: number): Particle {
  const cx = w / 2;
  const cy = h / 3;
  const angle = Math.random() * Math.PI - Math.PI / 2;
  const speed = 6 + Math.random() * 7;
  return {
    x: cx,
    y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 2,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    size: 6 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#C9A24B',
  };
}
