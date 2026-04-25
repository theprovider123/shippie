import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../db/schema.ts';
import { haptic } from '@shippie/sdk/wrapper';

export interface RecipeCardProps {
  recipe: Recipe;
  ingredientCount: number;
  onOpen: () => void;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = 80;

/**
 * Swipe-to-reveal recipe row. The wrapper's list-swipe rule auto-applies
 * to <ul data-shippie-list>; we add a per-card touch handler so the
 * showcase still works in dev (no wrapper) and so the haptic threshold
 * cross is unmistakable.
 */
export function RecipeCard({ recipe, ingredientCount, onOpen, onDelete }: RecipeCardProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const passedThreshold = useRef(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0]?.clientX ?? null;
      passedThreshold.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startX.current == null) return;
      const dx = (e.touches[0]?.clientX ?? startX.current) - startX.current;
      const next = Math.min(0, Math.max(-140, dx));
      setOffset(next);
      const past = next <= -SWIPE_THRESHOLD;
      if (past !== passedThreshold.current) {
        passedThreshold.current = past;
        haptic('tap');
      }
    };
    const onEnd = () => {
      if (passedThreshold.current) setOffset(-120);
      else setOffset(0);
      startX.current = null;
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: true });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <li className="recipe-card-wrapper">
      <button
        type="button"
        className="recipe-card-delete"
        aria-label={`Delete ${recipe.title}`}
        onClick={() => {
          haptic('warn');
          onDelete();
        }}
      >
        Delete
      </button>
      <div
        ref={cardRef}
        className="recipe-card"
        style={{ transform: `translateX(${offset}px)` }}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (offset !== 0) {
            setOffset(0);
            return;
          }
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <h3>{recipe.title}</h3>
        <p className="muted">
          {ingredientCount} ingredient{ingredientCount === 1 ? '' : 's'}
          {recipe.cook_minutes ? ` · ${recipe.cook_minutes} min` : ''}
          {recipe.servings ? ` · serves ${recipe.servings}` : ''}
        </p>
      </div>
    </li>
  );
}

export { SWIPE_THRESHOLD };
