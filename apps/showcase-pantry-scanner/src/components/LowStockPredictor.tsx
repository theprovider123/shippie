/**
 * Predicted-out-of-stock card. Surfaces the top N predictions from
 * `predictLowStock` and lets the user one-tap "add to shopping list"
 * (which broadcasts `pantry-low` so Shopping List picks it up).
 */
import type { LowStockPrediction } from '../lib/low-stock-predict.ts';

interface LowStockPredictorProps {
  predictions: readonly LowStockPrediction[];
  onAdd: (prediction: LowStockPrediction) => void;
  onDismiss?: (prediction: LowStockPrediction) => void;
}

export function LowStockPredictor({
  predictions,
  onAdd,
  onDismiss,
}: LowStockPredictorProps) {
  if (predictions.length === 0) return null;
  return (
    <section className="low-stock" aria-label="Predicted out of stock">
      <h2>Probably out</h2>
      <ul className="low-stock-list">
        {predictions.map((p) => (
          <li key={p.nameKey}>
            <div>
              <strong>{p.name}</strong>
              <small>
                you usually have one every {p.averageIntervalDays}d ·{' '}
                {p.daysSinceLast}d since last
              </small>
            </div>
            <div className="row-actions">
              <button
                type="button"
                onClick={() => onAdd(p)}
                className="row-btn row-btn-primary"
                aria-label={`Add ${p.name} to shopping list`}
              >
                add to list
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(p)}
                  className="row-btn row-btn-ghost"
                  aria-label={`Dismiss ${p.name}`}
                >
                  ×
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
