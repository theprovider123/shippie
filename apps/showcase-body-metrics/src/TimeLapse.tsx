/**
 * P3 — photo time-lapse scrub.
 *
 * Hands the user a slider that walks back through every entry that
 * carries a photo. The component fetches blobs lazily into object
 * URLs the first time it touches each id; revokes them on unmount.
 *
 * Photos never leave the device — this component reads from
 * `loadPhoto` (IndexedDB), no network paths exist.
 */
import { useEffect, useState } from 'react';
import { loadPhoto } from './photo-store.ts';

export interface TimeLapseEntry {
  date: string;
  photoLocalId: string;
  weightKg: number;
}

interface TimeLapseProps {
  entries: readonly TimeLapseEntry[];
  onClose: () => void;
}

export function TimeLapse({ entries, onClose }: TimeLapseProps) {
  // Sort oldest → newest so dragging the slider RIGHT = forward in time.
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const [index, setIndex] = useState(sorted.length - 1);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const entry of sorted) {
        const blob = await loadPhoto(entry.photoLocalId).catch(() => null);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        next[entry.photoLocalId] = url;
        created.push(url);
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  if (sorted.length === 0) {
    return (
      <div className="time-lapse" role="dialog" aria-modal="true">
        <p>No photos yet.</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  const current = sorted[index] ?? sorted[sorted.length - 1]!;
  const url = urls[current.photoLocalId];

  return (
    <div className="time-lapse" role="dialog" aria-modal="true" aria-label="Photo time lapse">
      <header>
        <strong>{current.date}</strong>
        <small>{current.weightKg.toFixed(1)} kg</small>
        <button className="ghost" onClick={onClose} aria-label="Close time lapse">
          ×
        </button>
      </header>
      <div className="time-lapse-stage">
        {url ? (
          <img src={url} alt={`Body photo ${current.date}`} />
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={sorted.length - 1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label={`Scrub photo ${index + 1} of ${sorted.length}`}
      />
      <p className="muted">
        {index + 1} of {sorted.length}
      </p>
    </div>
  );
}
