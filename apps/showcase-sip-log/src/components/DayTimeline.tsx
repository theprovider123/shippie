/**
 * Horizontal timeline for one day.
 *
 * Water sips render as blue ticks above the baseline, caffeine sips as
 * red ticks below. The visual is meant to be skim-able, not exact.
 */
import type { Sip } from '../db.ts';
import { dayKey, PRESETS } from '../db.ts';

interface DayTimelineProps {
  sips: ReadonlyArray<Sip>;
  day_key: string;
}

export function DayTimeline({ sips, day_key }: DayTimelineProps) {
  const todays = sips
    .filter((s) => dayKey(s.logged_at) === day_key)
    .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
  const lastCaffeine = [...todays].reverse().find((s) => s.mg > 0);
  const lastWater = [...todays].reverse().find((s) => s.kind === 'water');

  if (todays.length === 0) {
    return (
      <section className="card timeline-card empty" aria-label="Timeline">
        <p className="eyebrow">today · timeline</p>
        <p className="muted small">tap a button above to log your first sip.</p>
      </section>
    );
  }

  return (
    <section className="card timeline-card" aria-label="Today's timeline">
      <p className="eyebrow">today · timeline</p>
      <div className="tl">
        <div className="tl-axis" aria-hidden="true">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} className="tl-hour" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        <div className="tl-track">
          <div className="tl-baseline" aria-hidden="true" />
          {todays.map((s) => {
            const t = new Date(s.logged_at);
            const x = ((t.getHours() * 60 + t.getMinutes()) / (24 * 60)) * 100;
            const top = s.mg > 0;
            const preset = PRESETS[s.kind];
            const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <span
                key={s.id}
                className={`tl-tick ${top ? 'tl-tick-caffeine' : 'tl-tick-water'}`}
                style={{ left: `${x}%` }}
                title={`${preset.label} · ${time} · ${s.ml}ml${s.mg ? ` · ${s.mg}mg` : ''}`}
              />
            );
          })}
        </div>
      </div>
      <p className="small muted">
        {lastWater
          ? `last water ${time(lastWater.logged_at)}`
          : 'no water logged today'}
        {lastCaffeine
          ? ` · last caffeine ${time(lastCaffeine.logged_at)} (${lastCaffeine.mg} mg)`
          : ''}
      </p>
    </section>
  );
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
