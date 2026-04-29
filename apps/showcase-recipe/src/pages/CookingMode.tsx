import { useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { getRecipe } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { RecipeWithIngredients } from '../db/schema.ts';
import { IngredientList } from '../components/IngredientList.tsx';
import { haptic } from '@shippie/sdk/wrapper';

const shippie = createShippieIframeSdk({ appId: 'app_recipe_saver' });

interface CookingModeProps {
  recipeId: string;
  onClose: () => void;
}

/**
 * Full-screen cooking mode. The <video data-shippie-canvas> element is
 * picked up by the wrapper's wakelock rule on first user gesture, so the
 * screen stays awake while you cook. We render a static background loop
 * via canvas so iOS doesn't refuse to play (videos require source).
 */
export function CookingMode({ recipeId, onClose }: CookingModeProps) {
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getRecipe(resolveLocalDb(), recipeId);
      if (!cancelled) setRecipe(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  // Animated background — keeps the canvas live so the wakelock rule
  // (which watches data-shippie-canvas) has a real reason to engage.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const draw = () => {
      t += 0.005;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const grad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, Math.max(w, h));
      const phase = (Math.sin(t) + 1) / 2;
      grad.addColorStop(0, `rgba(232, 96, 60, ${0.08 + phase * 0.05})`);
      grad.addColorStop(1, 'rgba(20, 18, 15, 0)');
      ctx.fillStyle = '#14120F';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Tick timer
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Wake-lock fallback for dev (the wrapper's wakelock rule covers prod).
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    interface WakeLockNav {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    }
    const onClick = async () => {
      const nav = navigator as Navigator & WakeLockNav;
      try {
        if (nav.wakeLock?.request) sentinel = await nav.wakeLock.request('screen');
      } catch {
        // device or permission denied — ignore
      }
    };
    window.addEventListener('click', onClick, { once: true });
    return () => {
      window.removeEventListener('click', onClick);
      sentinel?.release().catch(() => {});
    };
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const target = recipe?.cook_minutes ?? 0;
  const overTime = target > 0 && seconds > target * 60;

  return (
    <div className="cooking-mode">
      <video data-shippie-canvas autoPlay loop muted playsInline className="cooking-video-stub" />
      <canvas data-shippie-canvas ref={canvasRef} className="cooking-canvas" aria-hidden="true" />
      <header className="cooking-header">
        <button type="button" className="ghost light" onClick={onClose}>
          Done
        </button>
      </header>
      <div className="cooking-body">
        <h2>{recipe?.title ?? 'Loading…'}</h2>
        <div className={`cooking-timer ${overTime ? 'cooking-timer-over' : ''}`}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
        {target > 0 ? (
          <p className="muted light">target: {target}m</p>
        ) : (
          <p className="muted light">no target set</p>
        )}
        <div className="cooking-controls">
          <button
            type="button"
            className="primary"
            onClick={() => {
              haptic('tap');
              setRunning((r) => !r);
            }}
          >
            {running ? 'Pause' : seconds === 0 ? 'Start' : 'Resume'}
          </button>
          <button
            type="button"
            className="ghost light"
            onClick={() => {
              haptic('warn');
              setRunning(false);
              setSeconds(0);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="ghost light"
            onClick={() => {
              haptic('tap');
              shippie.intent.broadcast('cooked-meal', [
                {
                  recipeId,
                  title: recipe?.title ?? 'meal',
                  cookedAt: new Date().toISOString(),
                },
              ]);
            }}
          >
            Mark cooked
          </button>
        </div>
        {recipe ? (
          <div className="cooking-ingredients">
            <h3>Ingredients</h3>
            <IngredientList ingredients={recipe.ingredients} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
