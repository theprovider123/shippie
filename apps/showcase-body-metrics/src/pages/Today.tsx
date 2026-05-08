/**
 * Today page — entry form + recent list + the snapshot trend line.
 *
 * Designed for the 5-second morning ritual: open app, type weight,
 * snap a photo (optional), tap Log, close. That's the whole story.
 */
import { useEffect, useState } from 'react';
import { EntryForm } from '../components/EntryForm.tsx';
import type { Entry } from '../lib/store.ts';
import { computeTrend } from '../lib/trend.ts';
import { loadPhoto } from '../photo-store.ts';

interface TodayProps {
  entries: readonly Entry[];
  onLog: (params: { entry: Omit<Entry, 'id'>; photoFile: File | null }) => Promise<void> | void;
  onRemove: (entry: Entry) => void;
}

export function Today({ entries, onLog, onRemove }: TodayProps) {
  const trend = computeTrend(entries);
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const e of recent) {
        if (!e.photoLocalId) continue;
        const blob = await loadPhoto(e.photoLocalId).catch(() => null);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        next[e.photoLocalId] = url;
        created.push(url);
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
    // recent is derived from entries; the join key here is the count
    // of photo'd entries — re-running on every reorder isn't useful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  return (
    <>
      {trend ? (
        <section className="trend" data-trend={trend.trend}>
          <strong>Trend:</strong> {trend.trend}
          <span className="rate">
            {trend.slope > 0 ? '+' : ''}
            {(trend.slope * 7).toFixed(2)} kg / week
          </span>
        </section>
      ) : (
        <section className="trend trend--insufficient">
          <small>Trend appears once you've logged 7 entries.</small>
        </section>
      )}

      <EntryForm onLog={onLog} />

      <section>
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">Log a measurement above to begin.</p>
        ) : (
          <ul>
            {recent.map((e) => (
              <li key={e.id}>
                <div className="meta">
                  <strong>{e.date}</strong>
                  <small>
                    {e.weightKg.toFixed(1)} kg
                    {e.bodyFatPct ? ` · ${e.bodyFatPct.toFixed(1)}% bf` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </small>
                </div>
                {e.photoLocalId && thumbs[e.photoLocalId] && (
                  <img src={thumbs[e.photoLocalId]} alt={`Body photo ${e.date}`} />
                )}
                <button onClick={() => onRemove(e)} aria-label={`Remove ${e.date}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
