/**
 * Brew journal — chronological feed of brews + notes. Each entry
 * includes the blend name (resolved on the fly) so deleted blends
 * still leave an entry the user can read.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Blend, BrewLogEntry } from '../db/schema.ts';
import { listBlends, listBrewLog } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';

interface JournalProps {
  onClose: () => void;
}

export function Journal({ onClose }: JournalProps) {
  const [entries, setEntries] = useState<BrewLogEntry[]>([]);
  const [blends, setBlends] = useState<Blend[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      const [log, list] = await Promise.all([listBrewLog(db), listBlends(db)]);
      if (cancelled) return;
      setEntries(log);
      setBlends(list);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blendName = useMemo(() => {
    const map = new Map(blends.map((b) => [b.id, b.name]));
    return (id: string) => map.get(id) ?? '(deleted blend)';
  }, [blends]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Brew journal</h1>
          <p className="muted">
            {loaded ? `${entries.length} brews logged` : 'Loading…'}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Back
        </button>
      </header>

      {loaded && entries.length === 0 ? (
        <div className="empty-state">
          <h3>No brews yet</h3>
          <p>
            Open a blend, tap “Brew it”, and your journal will start filling. The optional
            one-line note after each brew is what you'll thank yourself for in three months.
          </p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="journal-list" aria-label="Brew journal entries">
          {entries.map((entry) => (
            <li key={entry.id} className="journal-entry">
              <header>
                <span className="journal-entry-name">{blendName(entry.blend_id)}</span>
                <time className="journal-entry-time">{formatRelative(entry.brewed_at)}</time>
              </header>
              {entry.batch_label ? (
                <p className="muted journal-entry-batch">{entry.batch_label}</p>
              ) : null}
              {entry.note ? <p className="journal-entry-note">{entry.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return iso;
  const now = new Date();
  const diffMs = now.getTime() - at.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 7) return `${Math.floor(diffD)}d ago`;
  return at.toLocaleDateString();
}
