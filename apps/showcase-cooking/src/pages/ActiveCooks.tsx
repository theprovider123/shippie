/**
 * Active cooks list — see all timers running across methods at a glance.
 * Tap any cook to jump to its method-specific page.
 */

import { useEffect, useState } from 'react';
import { formatClock, METHOD_LABEL } from '../data.ts';
import { secondsRemaining, type Cook } from '../db.ts';

interface ActiveCooksProps {
  cooks: ReadonlyArray<Cook>;
  onSelect(cook: Cook): void;
}

export function ActiveCooks({ cooks, onSelect }: ActiveCooksProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (cooks.length === 0) {
    return (
      <section className="empty">
        <p className="eyebrow">active</p>
        <p className="muted">No cooks running. Pick a cut and start one.</p>
      </section>
    );
  }

  return (
    <section className="active-list" data-shippie-wakelock>
      <p className="eyebrow">cooking now · {cooks.length}</p>
      <ul>
        {cooks.map((c) => {
          const sec = secondsRemaining(c, now);
          const past = sec <= 0;
          return (
            <li key={c.id}>
              <button type="button" className="active-card" onClick={() => onSelect(c)}>
                <div className="active-card-head">
                  <strong>{c.cut_name}</strong>
                  <span className="muted small">
                    {METHOD_LABEL[c.method]}
                    {c.doneness ? ` · ${c.doneness}` : ''}
                  </span>
                </div>
                <div className="active-card-clock">
                  <span className={`clock ${past ? 'clock--past' : ''}`}>
                    {past ? '+' : ''}
                    {formatClock(Math.abs(sec))}
                  </span>
                  <span className="muted small">
                    {past ? 'past est. finish' : 'remaining'}
                  </span>
                </div>
                <div className="active-card-meta muted small">
                  target {c.target_temp_c}°C
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
