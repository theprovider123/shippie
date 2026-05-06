import type { Bean } from '../db.ts';
import { reading, type FreshnessReading } from '../lib/freshness.ts';

interface FreshnessChartProps {
  beans: ReadonlyArray<Bean>;
  onSelect?: (id: string) => void;
}

interface Row {
  bean: Bean;
  reading: FreshnessReading | null;
}

/**
 * Horizontal-bar freshness chart. One row per bean: filled segment
 * shows where the bean sits along its lifecycle, the band tag prints
 * the one-word state. Beans without a roast date sort last and render
 * a muted "no roast date" hint.
 */
export function FreshnessChart({ beans, onSelect }: FreshnessChartProps) {
  if (beans.length === 0) return null;

  const rows: Row[] = beans.map((b) => ({ bean: b, reading: reading(b.method, b.roast_date) }));
  rows.sort((a, b) => {
    if (a.reading && !b.reading) return -1;
    if (!a.reading && b.reading) return 1;
    if (a.reading && b.reading) return a.reading.daysSinceRoast - b.reading.daysSinceRoast;
    return 0;
  });

  return (
    <section className="freshness" aria-label="Freshness chart">
      <header className="freshness-header">
        <p className="eyebrow">freshness</p>
        <p className="muted small">peak → good → fading → stale</p>
      </header>
      <ul className="freshness-list">
        {rows.map(({ bean, reading: r }) => (
          <li key={bean.id}>
            <button
              type="button"
              className="freshness-row"
              onClick={() => onSelect?.(bean.id)}
              aria-label={`${bean.name}, ${r ? `${r.daysSinceRoast} days, ${r.label}` : 'no roast date'}`}
            >
              <div className="freshness-row-head">
                <span className="freshness-name">{bean.name}</span>
                <span className={`freshness-tag tag-${r?.band ?? 'unknown'}`}>
                  {r ? `${r.daysSinceRoast}d · ${r.label}` : 'no roast date'}
                </span>
              </div>
              <div className="freshness-bar" aria-hidden="true">
                <span className="freshness-band-rest" />
                <span className="freshness-band-peak" />
                <span className="freshness-band-good" />
                <span className="freshness-band-fading" />
                <span className="freshness-band-stale" />
                {r ? (
                  <span
                    className="freshness-marker"
                    style={{ left: `${Math.round(r.position * 100)}%` }}
                  />
                ) : null}
              </div>
              {r ? <p className="freshness-hint muted small">{r.hint}</p> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
