/**
 * React subpath helpers. Optional dependency — root entry never
 * imports React so games that don't need confetti / tutorial
 * primitives keep their bundle slim.
 */

import { useEffect, useRef, useState } from 'react';
import { Particles } from './particles';

interface ConfettiProps {
  /** Trigger key — change to fire a fresh burst. */
  trigger: number | string;
  /** Colour palette to rotate through. */
  colours?: string[];
  /** Particles to release (default 80). */
  count?: number;
  /** Burst origin in canvas coordinates. Defaults to top-centre. */
  origin?: { x?: number; y?: number };
}

const DEFAULT_COLOURS = ['#E84A2D', '#F4B860', '#7FB269', '#3F8AA8', '#7E5B96', '#C97B2D'];

/**
 * Full-viewport confetti overlay. Mounts a fixed canvas, fires a
 * particle burst on every `trigger` change, auto-cleans when no
 * particles remain.
 */
export function Confetti({ trigger, colours = DEFAULT_COLOURS, count = 80, origin }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<Particles | null>(null);
  const hasSeenTriggerRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fx = new Particles(canvas);
    fxRef.current = fx;
    const resize = () => fx.resize();
    resize();
    window.addEventListener('resize', resize);
    fx.start();
    return () => {
      window.removeEventListener('resize', resize);
      fx.stop();
      fxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fx = fxRef.current;
    const canvas = canvasRef.current;
    if (!fx || !canvas) return;
    if (!hasSeenTriggerRef.current) {
      hasSeenTriggerRef.current = true;
      return;
    }
    fx.emit({
      x: origin?.x ?? canvas.clientWidth / 2,
      y: origin?.y ?? 0,
      count,
      colour: colours,
      kind: 'rain',
      speed: 1.4,
      lifetimeMs: 1800,
    });
  }, [trigger, colours, count, origin?.x, origin?.y]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      aria-hidden
    />
  );
}

interface TutorialStep {
  title: string;
  body: string;
}

interface UseTutorialResult {
  active: boolean;
  step: TutorialStep | null;
  index: number;
  total: number;
  next: () => void;
  dismiss: () => void;
  reset: () => void;
}

/**
 * First-run tutorial sequence. Persists "seen" state in
 * localStorage[`shippie:tutorial:${gameSlug}:v1`]. Starts active on
 * first mount when no flag set; subsequent mounts stay inactive
 * unless `reset()` clears the flag.
 */
export function useTutorial(gameSlug: string, steps: TutorialStep[]): UseTutorialResult {
  const key = `shippie:tutorial:${gameSlug}:v1`;
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(key) !== '1';
  });

  const dismiss = () => {
    setActive(false);
    try { localStorage.setItem(key, '1'); } catch {/**/}
  };

  const next = () => {
    if (index + 1 >= steps.length) {
      dismiss();
      return;
    }
    setIndex(index + 1);
  };

  const reset = () => {
    try { localStorage.removeItem(key); } catch {/**/}
    setIndex(0);
    setActive(true);
  };

  return {
    active,
    step: active ? steps[index] ?? null : null,
    index,
    total: steps.length,
    next,
    dismiss,
    reset,
  };
}
