/**
 * LockGate — optional privacy screen shown when Cycle opens.
 *
 * If a lock PIN is set, the real app is hidden until the PIN is entered. A
 * separate "decoy" PIN (Euki-style duress) opens a believable but empty
 * facade instead of the real data — for a borrowed or seized phone. Neither
 * PIN is encryption (the data is already on-device); this is a deterrent
 * screen, and we say so plainly.
 *
 * The gate reads prefs once; while locked, the children (and therefore any DB
 * reads or the partner mesh) never mount.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { loadPrefs } from '../db/queries.ts';

type GateState = 'loading' | 'unlocked' | 'locked' | 'decoy';

export function LockGate({ db, children }: { db: ShippieLocalDb; children: ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const [lockPin, setLockPin] = useState<string | null>(null);
  const [decoyPin, setDecoyPin] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPrefs(db).then((p) => {
      if (cancelled) return;
      setLockPin(p.lock_pin);
      setDecoyPin(p.decoy_pin);
      setState(p.lock_pin ? 'locked' : 'unlocked');
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  function submit(): void {
    if (entry === lockPin) {
      setState('unlocked');
      setEntry('');
    } else if (decoyPin && entry === decoyPin) {
      setState('decoy');
      setEntry('');
    } else {
      setError(true);
      setEntry('');
      window.setTimeout(() => setError(false), 1200);
    }
  }

  if (state === 'loading') {
    return <main className="cycle-app"><p className="muted" style={{ padding: '2rem 1rem' }}>…</p></main>;
  }
  if (state === 'unlocked') return <>{children}</>;
  if (state === 'decoy') {
    // Believable empty facade — no real data is read or shown.
    return (
      <main className="cycle-app">
        <header className="app-bar"><h1>Cycle</h1></header>
        <section className="page today">
          <header className="page-head">
            <p className="eyebrow">Today</p>
            <h1>No active cycle</h1>
            <p className="muted">Nothing logged yet.</p>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className="cycle-app lock-screen" aria-label="App locked">
      <div className="lock-card">
        <p className="eyebrow">Locked</p>
        <h1>Enter your PIN</h1>
        <p className="muted">Cycle is locked on this device. This is a privacy screen, not encryption.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label="PIN"
          className={error ? 'lock-input error' : 'lock-input'}
        />
        <button type="button" className="primary" onClick={submit} disabled={entry.length < 4}>
          Unlock
        </button>
        {error ? <p className="lock-error">Wrong PIN.</p> : null}
      </div>
    </main>
  );
}
