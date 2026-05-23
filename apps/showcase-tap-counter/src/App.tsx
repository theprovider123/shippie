import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';

/**
 * Tap Counter — physical input mirror.
 *
 * Tap to count anything (coffees, reps, drinks). Big number,
 * satisfying haptic on tap. Counters are user-labelled and persist
 * locally. Each tap emits a `counter.tapped { label, count }`
 * observation so other apps can correlate without anyone typing
 * "had a coffee at 2:15pm" into a form.
 *
 * Storage: plain localStorage. Counters are tiny + we want zero
 * runtime dependencies for the simplest possible mirror.
 */

interface Counter {
  id: string;
  label: string;
  count: number;
  resetAt: string;
}

const STORAGE_KEY = 'shippie:tap-counter:v1';

const sdk = createShippieIframeSdk({ appId: 'app_tap_counter' });
const observations = createObservationClient(sdk);

function loadCounters(): Counter[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Counter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCounters(counters: Counter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counters));
  } catch {
    /* quota — best-effort */
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [counters, setCounters] = useState<Counter[]>(() => loadCounters());
  const [activeId, setActiveId] = useState<string | null>(() => loadCounters()[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');

  useEffect(() => {
    saveCounters(counters);
  }, [counters]);

  const active = useMemo(
    () => counters.find((c) => c.id === activeId) ?? counters[0] ?? null,
    [counters, activeId],
  );

  const runningSum = useMemo(
    () => counters.reduce((acc, c) => acc + c.count, 0),
    [counters],
  );

  const addCounter = () => {
    const label = draftLabel.trim();
    if (!label) return;
    const next: Counter = { id: newId(), label, count: 0, resetAt: new Date().toISOString() };
    setCounters((prev) => [next, ...prev]);
    setActiveId(next.id);
    setDraftLabel('');
    setAdding(false);
    haptic('success');
  };

  const tap = (id: string) => {
    haptic('tap');
    setCounters((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, count: c.count + 1 } : c));
      const counter = next.find((c) => c.id === id);
      if (counter) {
        observations.emit({
          kind: 'counter.tapped',
          label: counter.label,
          count: counter.count,
          at: new Date().toISOString(),
        });
      }
      return next;
    });
  };

  const reset = (id: string) => {
    if (!window.confirm('Reset this counter to zero? The label stays.')) return;
    haptic('warn');
    setCounters((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, count: 0, resetAt: new Date().toISOString() } : c,
      ),
    );
  };

  const remove = (id: string) => {
    if (!window.confirm('Delete this counter? The history is lost.')) return;
    haptic('warn');
    setCounters((prev) => prev.filter((c) => c.id !== id));
    setActiveId((current) => (current === id ? null : current));
  };

  if (counters.length === 0 && !adding) {
    return (
      <main className="app">
        <header>
          <h1>Tap Counter</h1>
          <p className="muted">Count anything. Big number. Zero typing.</p>
        </header>
        <section className="empty">
          <p>You haven't added a counter yet.</p>
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            Add your first counter
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="head">
        <h1>Tap Counter</h1>
        <button type="button" className="ghost" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New'}
        </button>
      </header>

      {adding ? (
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addCounter();
          }}
        >
          <input
            type="text"
            placeholder="What are you counting? e.g. coffee"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            autoFocus
          />
          <button type="submit" className="primary" disabled={!draftLabel.trim()}>
            Add
          </button>
        </form>
      ) : null}

      {counters.length > 1 ? (
        <nav className="counter-tabs" aria-label="Counters">
          {counters.map((counter) => (
            <button
              key={counter.id}
              type="button"
              className={counter.id === active?.id ? 'tab active' : 'tab'}
              onClick={() => setActiveId(counter.id)}
            >
              {counter.label}
            </button>
          ))}
        </nav>
      ) : null}

      {active ? (
        <section className="big-number" aria-label={`${active.label} count`}>
          <p className="muted label">{active.label}</p>
          <button
            type="button"
            className="tap-target"
            onClick={() => tap(active.id)}
            aria-label={`Tap to add 1 to ${active.label}`}
          >
            <strong>{active.count}</strong>
            <span className="muted hint">Tap anywhere</span>
          </button>
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => reset(active.id)}>
              Reset
            </button>
            <button type="button" className="ghost danger" onClick={() => remove(active.id)}>
              Delete
            </button>
          </div>
          <p className="muted small">Started {new Date(active.resetAt).toLocaleDateString()}.</p>
        </section>
      ) : null}

      {counters.length > 1 ? (
        <footer className="running-sum" aria-label="Running sum across counters">
          <span className="muted small">Across all counters</span>
          <strong>{runningSum}</strong>
        </footer>
      ) : null}
    </main>
  );
}
