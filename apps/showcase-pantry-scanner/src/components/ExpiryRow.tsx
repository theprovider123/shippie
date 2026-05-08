/**
 * Single pantry-item row. The row colours itself by expiry bucket so
 * you can scan a list and tell red from green at arm's length.
 */
import type { Item } from '../lib/types.ts';
import { LOCATION_LABELS } from '../lib/types.ts';
import { bucketFor, daysUntil, phraseDays } from '../lib/expiry.ts';

interface ExpiryRowProps {
  item: Item;
  onRemove: (id: string) => void;
  onEdit?: (id: string) => void;
  onConsume?: (id: string) => void;
  now?: number;
  /** Show the location chip alongside quantity. Default true. */
  showLocation?: boolean;
}

export function ExpiryRow({
  item,
  onRemove,
  onEdit,
  onConsume,
  now,
  showLocation = true,
}: ExpiryRowProps) {
  const bucket = bucketFor(item, now);
  const days = item.expiresOn ? daysUntil(item.expiresOn, now) : null;

  return (
    <li
      className={`row row-${bucket}`}
      data-bucket={bucket}
      aria-label={`${item.name}, ${LOCATION_LABELS[item.location]}`}
    >
      <div className="row-body">
        <div className="row-head">
          <strong className="row-name">{item.name}</strong>
          {item.expiresOn && days !== null && (
            <span className={`row-days days-${bucket}`}>
              {phraseDays(days)}
            </span>
          )}
        </div>
        <small className="row-meta">
          {item.quantity} {item.unit}
          {showLocation && (
            <>
              {' · '}
              <span className="row-location">
                {LOCATION_LABELS[item.location]}
              </span>
            </>
          )}
          {item.barcode && ` · ${item.barcode}`}
          {item.notes && ` · ${item.notes}`}
        </small>
      </div>
      <div className="row-actions">
        {onConsume && item.quantity > 0 && (
          <button
            type="button"
            onClick={() => onConsume(item.id)}
            className="row-btn row-btn-ghost"
            aria-label={`Use one ${item.name}`}
            title="Use one"
          >
            −1
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(item.id)}
            className="row-btn row-btn-ghost"
            aria-label={`Edit ${item.name}`}
            title="Edit"
          >
            ✎
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="row-btn row-btn-ghost"
          aria-label={`Remove ${item.name}`}
          title="Remove"
        >
          ×
        </button>
      </div>
    </li>
  );
}
