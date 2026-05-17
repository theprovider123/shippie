import { useMemo } from 'react';
import { formatQuantity, scaleIngredients } from '../lib/scale.ts';
import type { PlanCell } from '../lib/types.ts';

interface PortionScalerProps {
  cell: PlanCell;
  onChange: (servings: number) => void;
}

/**
 * Servings stepper + live ingredient preview. The user can see what
 * "scale to 4" actually means before committing — quantities and
 * shopping-list math derive from the same source.
 */
export function PortionScaler({ cell, onChange }: PortionScalerProps) {
  const scaled = useMemo(
    () => scaleIngredients(cell.ingredients, cell.baseServings, cell.servings),
    [cell.ingredients, cell.baseServings, cell.servings],
  );
  const factor = cell.baseServings > 0 ? cell.servings / cell.baseServings : 1;

  return (
    <div className="portion">
      <div className="portion-row">
        <button
          type="button"
          className="ghost step"
          onClick={() => onChange(Math.max(1, cell.servings - 1))}
          aria-label="Fewer servings"
        >
          −
        </button>
        <div className="portion-meta">
          <strong>{cell.servings}</strong> serving{cell.servings === 1 ? '' : 's'}
          <small>
            recipe yields {cell.baseServings} · ×{factor.toFixed(2)}
          </small>
        </div>
        <button
          type="button"
          className="ghost step"
          onClick={() => onChange(cell.servings + 1)}
          aria-label="More servings"
        >
          +
        </button>
      </div>
      {scaled.length > 0 ? (
        <ul className="scaled-list">
          {scaled.map((ing) => (
            <li key={ing.name}>
              {typeof ing.quantity === 'number' ? (
                <span className="qty">
                  {formatQuantity(ing.quantity)}
                  {ing.unit ? ing.unit : ''}
                </span>
              ) : (
                <span className="qty muted">—</span>
              )}
              <span className="name">{ing.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No ingredient quantities — scaling has nothing to lift.</p>
      )}
    </div>
  );
}
