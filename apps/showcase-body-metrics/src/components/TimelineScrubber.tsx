/**
 * Horizontal photo timeline.
 *
 * Renders a scrubbable strip of every photo entry, oldest → newest.
 * Tap a thumbnail → full-size modal. Drag the range slider → strip
 * scrolls + the active thumbnail expands. The strip itself is also
 * directly horizontally scrollable on touch devices.
 *
 * Photos never leave the device — blob URLs are created on mount
 * and revoked on unmount.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPhoto } from '../photo-store.ts';

export interface TimelineEntry {
  id: string;
  date: string;
  weightKg: number;
  photoLocalId: string;
}

interface TimelineScrubberProps {
  entries: readonly TimelineEntry[];
  onSelect?: (entry: TimelineEntry) => void;
  onCompare?: () => void;
}

export function TimelineScrubber({ entries, onSelect, onCompare }: TimelineScrubberProps) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [active, setActive] = useState(Math.max(0, sorted.length - 1));
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Lazy-load every blob into an object URL once, revoke on unmount.
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
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [sorted]);

  // Keep active thumbnail visible when scrubbing.
  useEffect(() => {
    const cur = sorted[active];
    if (!cur) return;
    const node = thumbRefs.current.get(cur.id);
    if (node && stripRef.current) {
      node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active, sorted]);

  if (sorted.length === 0) {
    return (
      <div className="timeline timeline--empty">
        <p>Photos you add will appear here as a scrubbable timeline.</p>
        <p className="muted">Photos stay on this device — they're stored in IndexedDB on this phone.</p>
      </div>
    );
  }

  const current = sorted[active] ?? sorted[sorted.length - 1]!;

  return (
    <div className="timeline">
      <div className="timeline-stage">
        {urls[current.photoLocalId] ? (
          <img
            src={urls[current.photoLocalId]}
            alt={`Body photo ${current.date}`}
            onClick={() => onSelect?.(current)}
          />
        ) : (
          <div className="timeline-stage__placeholder">Loading…</div>
        )}
        <div className="timeline-stage__overlay">
          <strong>{current.date}</strong>
          <span>{current.weightKg.toFixed(1)} kg</span>
        </div>
      </div>

      <div className="timeline-scrub">
        <input
          type="range"
          min={0}
          max={sorted.length - 1}
          value={active}
          onChange={(e) => setActive(Number(e.target.value))}
          aria-label={`Scrub photo ${active + 1} of ${sorted.length}`}
        />
        <div className="timeline-scrub__counts">
          <span>{sorted[0]!.date}</span>
          <span>{sorted[sorted.length - 1]!.date}</span>
        </div>
      </div>

      <div ref={stripRef} className="timeline-strip" role="listbox" aria-label="Photo timeline">
        {sorted.map((e, i) => (
          <button
            key={e.id}
            ref={(node) => {
              if (node) thumbRefs.current.set(e.id, node);
              else thumbRefs.current.delete(e.id);
            }}
            type="button"
            className={`timeline-thumb${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
            aria-label={`${e.date} — ${e.weightKg.toFixed(1)} kg`}
            role="option"
            aria-selected={i === active}
          >
            {urls[e.photoLocalId] ? (
              <img src={urls[e.photoLocalId]} alt="" />
            ) : (
              <div className="timeline-thumb__placeholder" />
            )}
            <small>{e.date.slice(5)}</small>
          </button>
        ))}
      </div>

      {sorted.length >= 2 && onCompare && (
        <button type="button" className="ghost-btn" onClick={onCompare}>
          Compare two photos
        </button>
      )}
    </div>
  );
}
