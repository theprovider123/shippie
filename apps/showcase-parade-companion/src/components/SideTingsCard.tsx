import { useEffect, useState } from 'react';
import {
  chipForGroupName,
  listSideTings,
  removeSideTing,
  type SideTing,
} from '../lib/side-tings';

interface SideTingsCardProps {
  /** Open the add-side-ting flow (scan or paste). */
  onAdd: () => void;
  /** Bump to force a re-read after an external add/remove. */
  refreshKey?: number;
  onChange?: () => void;
}

/**
 * The "Side tings" card on the Group screen: list of other groups the user is
 * watching, with a chip per row, last-seen age, remove button, and an add CTA.
 */
export function SideTingsCard({ onAdd, refreshKey, onChange }: SideTingsCardProps) {
  const [rows, setRows] = useState<SideTing[]>(() => listSideTings());

  useEffect(() => {
    setRows(listSideTings());
  }, [refreshKey]);

  const onRemove = (roomId: string) => {
    removeSideTing(roomId);
    setRows(listSideTings());
    onChange?.();
  };

  return (
    <div className="panel side-tings-card">
      <div className="side-tings-card__header">
        <h2>Side tings</h2>
        <button type="button" className="secondary-action side-tings-card__add" onClick={onAdd}>
          + Add
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="side-tings-card__empty">
          Watch another crew on your map. Scan their QR or paste their code to add them.
        </p>
      ) : (
        <ul className="side-tings-card__list">
          {rows.map((row) => (
            <li className="side-tings-card__row" key={row.roomId}>
              <span className="side-tings-card__chip" aria-hidden>
                {chipForGroupName(row.name)}
              </span>
              <div className="side-tings-card__meta">
                <strong>{row.name}</strong>
                <small>
                  {row.memberCount} {row.memberCount === 1 ? 'member' : 'members'}
                  {row.lastSeenAt
                    ? ` · last seen ${formatAge(row.lastSeenAt)}`
                    : ' · waiting for signal'}
                </small>
              </div>
              <button
                type="button"
                className="side-tings-card__remove"
                aria-label={`Stop watching ${row.name}`}
                onClick={() => onRemove(row.roomId)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAge(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return 'just now';
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 60 * 60) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}
