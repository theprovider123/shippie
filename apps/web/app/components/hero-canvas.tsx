'use client';

import { useEffect, useRef } from 'react';

/**
 * Subtle WebGL-style background for the hero. Renders soft warm orbs
 * that drift slowly. Pure canvas — no WebGL library needed.
 *
 * Kept lightweight: ~30 orbs, no physics, requestAnimationFrame at
 * native refresh rate, pauses when tab is hidden.
 */
export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let w = 0;
    let h = 0;
    let raf = 0;

    interface Orb {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
    }

    const orbs: Orb[] = [];

    const colors = [
      'rgba(232, 96, 60, ',   // sunset
      'rgba(122, 154, 110, ', // sage-leaf
      'rgba(94, 123, 92, ',   // sage-moss
      'rgba(232, 197, 71, ',  // marigold
      'rgba(168, 196, 145, ', // sage-highlight
    ];

    function resize() {
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * devicePixelRatio;
      canvas!.height = h * devicePixelRatio;
      ctx!.scale(devicePixelRatio, devicePixelRatio);
    }

    function seed() {
      orbs.length = 0;
      for (let i = 0; i < 25; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 40 + Math.random() * 120,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2,
          color: colors[Math.floor(Math.random() * colors.length)]!,
          alpha: 0.02 + Math.random() * 0.04,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      for (const o of orbs) {
        o.x += o.vx;
        o.y += o.vy;

        // Wrap around edges
        if (o.x < -o.r) o.x = w + o.r;
        if (o.x > w + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = h + o.r;
        if (o.y > h + o.r) o.y = -o.r;

        const grad = ctx!.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        grad.addColorStop(0, o.color + o.alpha + ')');
        grad.addColorStop(1, o.color + '0)');
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    seed();
    draw();

    window.addEventListener('resize', () => { resize(); seed(); });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 1 }}
      aria-hidden
    />
  );
}
