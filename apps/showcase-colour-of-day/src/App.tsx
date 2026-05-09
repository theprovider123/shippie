import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient, type Sentiment } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';

/**
 * Colour of the Day — mood as art.
 *
 * One tap on a colour wheel for today. No words, no scales, no
 * journaling. Builds a ribbon of colours over time. Each pick emits a
 * `mood.color_picked { color, sentiment }` observation; sentiment is
 * derived from the colour's warmth (warm = +1, neutral = 0, cool = -1).
 *
 * Storage: localStorage of {date → entry} so the ribbon shows past 30
 * days at a glance without OPFS overhead.
 */

interface DayEntry {
  date: string;       // YYYY-MM-DD (local)
  color: string;      // CSS hex
  sentiment: Sentiment;
}

const STORAGE_KEY = 'shippie:colour-of-day:v1';

const sdk = createShippieIframeSdk({ appId: 'app_colour_of_day' });
const observations = createObservationClient(sdk);

// Curated palette: 12 colours arranged warm→cool. Sentiment maps to
// position: warm halves (orange/amber/coral) read as +1, cool halves
// (blue/teal/violet) read as -1, the green/yellow band is 0.
const PALETTE: ReadonlyArray<{ color: string; sentiment: Sentiment; label: string }> = [
  { color: '#E84A2D', sentiment: 1, label: 'fire' },
  { color: '#F0734A', sentiment: 1, label: 'sunset' },
  { color: '#F4B860', sentiment: 1, label: 'amber' },
  { color: '#F2D779', sentiment: 1, label: 'wheat' },
  { color: '#C9D67A', sentiment: 0, label: 'olive' },
  { color: '#7FB269', sentiment: 0, label: 'leaf' },
  { color: '#4FA487', sentiment: 0, label: 'sage' },
  { color: '#3F8AA8', sentiment: -1, label: 'tide' },
  { color: '#3D6BAB', sentiment: -1, label: 'deep' },
  { color: '#5C5BA3', sentiment: -1, label: 'twilight' },
  { color: '#7E5B96', sentiment: -1, label: 'plum' },
  { color: '#8C8C8C', sentiment: 0, label: 'stone' },
];

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadEntries(): Record<string, DayEntry> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) ?? {}) as Record<string, DayEntry>;
  } catch {
    return {};
  }
}

function saveEntries(entries: Record<string, DayEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* best-effort */
  }
}

function formatDate(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function App() {
  const [entries, setEntries] = useState<Record<string, DayEntry>>(() => loadEntries());
  const today = todayKey();
  const todayEntry = entries[today];

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  const pick = (color: string, sentiment: Sentiment) => {
    haptic('tap');
    const next: DayEntry = { date: today, color, sentiment };
    setEntries((prev) => ({ ...prev, [today]: next }));
    observations.emit({
      kind: 'mood.color_picked',
      color,
      sentiment,
      at: new Date().toISOString(),
    });
  };

  // Ribbon = past 30 days, oldest first. Empty days render as a
  // hollow tile so the rhythm of skipped days stays visible.
  const ribbon = useMemo(() => {
    const out: { key: string; entry: DayEntry | null }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      out.push({ key, entry: entries[key] ?? null });
    }
    return out;
  }, [entries]);

  const filledCount = ribbon.filter((d) => d.entry).length;

  return (
    <main className="app">
      <header>
        <h1>Colour of the Day</h1>
        <p className="muted">{todayEntry ? `Picked for ${formatDate(today)}` : `Pick a colour for today`}</p>
      </header>

      <section className="wheel" aria-label="Colour palette">
        {PALETTE.map((swatch) => {
          const picked = todayEntry?.color === swatch.color;
          return (
            <button
              key={swatch.color}
              type="button"
              className={picked ? 'swatch picked' : 'swatch'}
              style={{ background: swatch.color }}
              onClick={() => pick(swatch.color, swatch.sentiment)}
              aria-label={`Pick ${swatch.label}`}
              aria-pressed={picked}
            />
          );
        })}
      </section>

      {todayEntry ? (
        <section className="today-readout" aria-live="polite">
          <p>
            Today reads as <strong>{PALETTE.find((p) => p.color === todayEntry.color)?.label ?? '—'}</strong>.
          </p>
        </section>
      ) : null}

      <section className="ribbon-section">
        <h2>Last 30 days</h2>
        <p className="muted small">{filledCount} filled · {30 - filledCount} skipped</p>
        <div className="ribbon" role="img" aria-label={`Mood ribbon, ${filledCount} of 30 days filled`}>
          {ribbon.map(({ key, entry }) => (
            <span
              key={key}
              className={entry ? 'tile filled' : 'tile empty'}
              style={entry ? { background: entry.color } : undefined}
              title={entry ? `${formatDate(key)} — ${entry.color}` : `${formatDate(key)} — skipped`}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
