import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../db/schema.ts';
import { haptic } from '@shippie/sdk/wrapper';

export interface RecipeCardProps {
  recipe: Recipe;
  ingredientCount: number;
  sendStatus?: string | null;
  onOpen: () => void;
  onCook: () => void;
  onPlan: (event: React.MouseEvent) => void;
  onShare: () => void;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = 80;

/**
 * Recipe card — the home-screen row.
 *
 * Single card frame holds: sunset accent stripe → title → meta → action
 * bar (Cook · Plan · Share · Delete). Tap the card body to open the
 * editor; the action bar stops propagation. Swipe-left reveals a
 * larger Delete affordance on touch devices; desktop users get a
 * hover-revealed delete control built into the action bar.
 */
export function RecipeCard({
  recipe,
  ingredientCount,
  sendStatus,
  onOpen,
  onCook,
  onPlan,
  onShare,
  onDelete,
}: RecipeCardProps) {
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
      >
        <button
          type="button"
          className="recipe-card-body"
          onClick={() => {
            if (offset !== 0) {
              setOffset(0);
              return;
            }
            onOpen();
          }}
        >
          <span className="recipe-card-stripe" aria-hidden="true" />
          <span className="recipe-card-title-block">
            <h3>{recipe.title}</h3>
            <p className="recipe-card-meta">
              {ingredientCount} ingredient{ingredientCount === 1 ? '' : 's'}
              {recipe.cook_minutes ? ` · ${recipe.cook_minutes} min` : ''}
              {recipe.servings ? ` · serves ${recipe.servings}` : ''}
            </p>
          </span>
        </button>
        <div className="recipe-card-actions" aria-label={`Actions for ${recipe.title}`}>
          <button
            type="button"
            className="recipe-action recipe-action-primary"
            onClick={(e) => {
              e.stopPropagation();
              onCook();
            }}
            aria-label={`Cook ${recipe.title}`}
          >
            Cook
          </button>
          <button
            type="button"
            className="recipe-action"
            onClick={onPlan}
            aria-label={`Send ${recipe.title} to Meal Planner`}
          >
            Plan
          </button>
          <button
            type="button"
            className="recipe-action"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            aria-label={`Share ${recipe.title}`}
          >
            Share
          </button>
          <button
            type="button"
            className="recipe-action recipe-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              haptic('warn');
              onDelete();
            }}
            aria-label={`Delete ${recipe.title}`}
            title="Delete"
          >
            ×
          </button>
        </div>
        {sendStatus ? <p className="recipe-card-status">{sendStatus}</p> : null}
      </div>
    </li>
  );
}

export { SWIPE_THRESHOLD };
