/**
 * Then-vs-Now compare.
 *
 * Two-photo side-by-side viewer. Two date pickers; defaults pick the
 * oldest available + the newest available. Each photo shows its
 * weight as a small numeric overlay. The voice is plain — no "look
 * how far you've come" copy.
 *
 * Photos load directly from IndexedDB; there's no network path.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TimelineEntry } from './TimelineScrubber.tsx';
import { loadPhoto } from '../photo-store.ts';

interface CompareViewProps {
  entries: readonly TimelineEntry[];
  onClose: () => void;
}

export function CompareView({ entries, onClose }: CompareViewProps) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );
  const [leftId, setLeftId] = useState(() => sorted[0]?.id ?? '');
  const [rightId, setRightId] = useState(() => sorted.at(-1)?.id ?? '');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const e of sorted) {
        const blob = await loadPhoto(e.photoLocalId).catch(() => null);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        next[e.photoLocalId] = url;
        created.push(url);
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [sorted]);

  const left = sorted.find((e) => e.id === leftId) ?? sorted[0];
  const right = sorted.find((e) => e.id === rightId) ?? sorted.at(-1);
  const delta = left && right ? right.weightKg - left.weightKg : 0;
  const days = left && right
    ? Math.round(
        (new Date(right.date).getTime() - new Date(left.date).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : 0;

  return (
    <div className="compare" role="dialog" aria-modal="true" aria-label="Compare two photos">
      <header className="compare__header">
        <strong>Then vs now</strong>
        <button onClick={onClose} aria-label="Close compare view">×</button>
      </header>

      <div className="compare__pair">
        <PhotoSide
          label="Then"
          entry={left}
          url={left ? urls[left.photoLocalId] : undefined}
        />
        <PhotoSide
          label="Now"
          entry={right}
          url={right ? urls[right.photoLocalId] : undefined}
        />
      </div>

      {left && right && (
        <div className="compare__delta">
          <span>{Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} apart</span>
          <strong>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)} kg
          </strong>
        </div>
      )}

      <div className="compare__pickers">
        <label>
          <span>Then</span>
          <select value={leftId} onChange={(e) => setLeftId(e.target.value)}>
            {sorted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.date} — {e.weightKg.toFixed(1)} kg
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Now</span>
          <select value={rightId} onChange={(e) => setRightId(e.target.value)}>
            {sorted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.date} — {e.weightKg.toFixed(1)} kg
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function PhotoSide({
  label,
  entry,
  url,
}: {
  label: string;
  entry: TimelineEntry | undefined;
  url: string | undefined;
}) {
  if (!entry) {
    return (
      <div className="compare__side compare__side--empty">
        <small>{label}</small>
        <p className="muted">No photo</p>
      </div>
    );
  }
  return (
    <figure className="compare__side">
      <small>{label}</small>
      {url ? (
        <img src={url} alt={`${label} — ${entry.date}`} />
      ) : (
        <div className="compare__placeholder">Loading…</div>
      )}
      <figcaption>
        <strong>{entry.weightKg.toFixed(1)} kg</strong>
        <span>{entry.date}</span>
      </figcaption>
    </figure>
  );
}
