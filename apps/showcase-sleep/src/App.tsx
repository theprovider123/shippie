import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  createSleepEntry,
  defaultSleepDraft,
  formatDuration,
  lastSevenNights,
  minutesBetween,
  summarizeSleep,
  type SleepDraft,
  type SleepEntry,
} from './sleep.ts';

const shippie = createShippieIframeSdk({ appId: 'app_sleep' });
const STORAGE_KEY = 'shippie.sleep.v1';
const PRESETS: Array<{ label: string; bedTime: string; wakeTime: string }> = [
  { label: 'Early', bedTime: '22:30', wakeTime: '06:30' },
  { label: 'Standard', bedTime: '23:00', wakeTime: '07:00' },
  { label: 'Late', bedTime: '00:30', wakeTime: '08:00' },
];

function loadEntries(): SleepEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(isSleepEntry).slice(0, 120);
  } catch {
    return [];
  }
}

function saveEntries(entries: readonly SleepEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    /* local quota errors should not block a fresh log */
  }
}

export function App() {
  const [entries, setEntries] = useState<SleepEntry[]>(() => loadEntries());
  const [draft, setDraft] = useState<SleepDraft>(() => defaultSleepDraft());

  useEffect(() => saveEntries(entries), [entries]);

  const durationMinutes = minutesBetween(draft.bedTime, draft.wakeTime);
  const summary = useMemo(() => summarizeSleep(entries), [entries]);
  const week = useMemo(() => lastSevenNights(entries), [entries]);
  const recent = entries.slice(0, 6);
  const maxBar = Math.max(600, ...week.map((entry) => entry.durationMinutes));

  function updateDraft(patch: Partial<SleepDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function logSleep() {
    if (durationMinutes < 60) return;
    const entry = createSleepEntry(draft);
    setEntries((prev) => [entry, ...prev.filter((item) => item.sleptOn !== entry.sleptOn)].slice(0, 120));
    updateDraft({ note: '' });
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('sleep-logged', [
      {
        slept_on: entry.sleptOn,
        bedtime: entry.bedTime,
        wake_time: entry.wakeTime,
        duration_minutes: entry.durationMinutes,
        duration_hours: Number((entry.durationMinutes / 60).toFixed(2)),
        quality: entry.quality,
        note: entry.note,
        logged_at: new Date(entry.createdAt).toISOString(),
      },
    ]);
  }

  return (
    <main className="sleep-app">
      <header className="sleep-hero">
        <p className="eyebrow">Private sleep log</p>
        <h1>Sleep</h1>
        <p>Last night stays on this phone, then Chiwit gets the signal.</p>
      </header>

      <section className="log-panel" aria-labelledby="log-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Log</p>
            <h2 id="log-title">Last night</h2>
          </div>
          <strong className="duration">{formatDuration(durationMinutes)}</strong>
        </div>

        <div className="preset-row" aria-label="Sleep time presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="ghost"
              onClick={() => updateDraft({ bedTime: preset.bedTime, wakeTime: preset.wakeTime })}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>Night</span>
            <input
              type="date"
              value={draft.sleptOn}
              onChange={(event) => updateDraft({ sleptOn: event.target.value })}
            />
          </label>
          <label>
            <span>Bed</span>
            <input
              type="time"
              value={draft.bedTime}
              onChange={(event) => updateDraft({ bedTime: event.target.value })}
            />
          </label>
          <label>
            <span>Wake</span>
            <input
              type="time"
              value={draft.wakeTime}
              onChange={(event) => updateDraft({ wakeTime: event.target.value })}
            />
          </label>
        </div>

        <label className="quality">
          <span>Quality {draft.quality}/5</span>
          <input
            type="range"
            min={1}
            max={5}
            value={draft.quality}
            onChange={(event) => updateDraft({ quality: Number(event.target.value) })}
          />
        </label>

        <textarea
          value={draft.note}
          onChange={(event) => updateDraft({ note: event.target.value.slice(0, 180) })}
          placeholder="optional note"
          rows={2}
        />

        <button type="button" className="primary" disabled={durationMinutes < 60} onClick={logSleep}>
          Log sleep
        </button>
      </section>

      <section className="summary-grid" aria-label="Sleep summary">
        <div>
          <strong>{summary.averageMinutes === null ? '-' : formatDuration(summary.averageMinutes)}</strong>
          <span>average</span>
        </div>
        <div>
          <strong>{summary.averageQuality === null ? '-' : summary.averageQuality.toFixed(1)}</strong>
          <span>quality</span>
        </div>
        <div>
          <strong>{summary.streakDays}</strong>
          <span>day streak</span>
        </div>
      </section>

      <section className="trend" aria-labelledby="trend-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Trend</p>
            <h2 id="trend-title">Seven nights</h2>
          </div>
          <small>{summary.count} total</small>
        </div>
        {week.length === 0 ? (
          <p className="empty">No nights logged yet.</p>
        ) : (
          <ol className="bars">
            {week.map((entry) => (
              <li key={entry.id}>
                <span>{shortDate(entry.sleptOn)}</span>
                <i style={{ '--bar': entry.durationMinutes / maxBar } as CSSProperties} />
                <strong>{formatDuration(entry.durationMinutes)}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title">Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">The first log creates the sleep signal for Chiwit.</p>
        ) : (
          <ul>
            {recent.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{shortDate(entry.sleptOn)}</strong>
                  <small>{entry.bedTime} - {entry.wakeTime}</small>
                </div>
                <span>{entry.quality}/5</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function isSleepEntry(value: unknown): value is SleepEntry {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<SleepEntry>;
  return (
    typeof row.id === 'string' &&
    typeof row.sleptOn === 'string' &&
    typeof row.bedTime === 'string' &&
    typeof row.wakeTime === 'string' &&
    typeof row.durationMinutes === 'number' &&
    typeof row.quality === 'number' &&
    typeof row.createdAt === 'number'
  );
}

function shortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${day}/${month}` : value;
}
