/**
 * SVG caffeine residual curve across one day.
 *
 * X axis: 00:00 → 24:00.
 * Y axis: residual mg (auto-scaled, min 200 mg so a single coffee
 * doesn't fill the panel).
 *
 * Red ticks mark caffeine ingestion times; the curve falls off at the
 * 5h half-life. A vertical line marks the cutoff hour. The "now"
 * indicator is a thin sage line so the user can see the current
 * residual at a glance.
 */
import { caffeineCurve, midnightResidual } from '../lib/caffeine-half-life.ts';
import type { Sip, Targets } from '../db.ts';
import { dayKey } from '../db.ts';

interface CaffeineCurveProps {
  sips: ReadonlyArray<Sip>;
  targets: Targets;
  day_key: string;
  now?: Date;
}

const VIEW_W = 320;
const VIEW_H = 120;
const PAD_X = 12;
const PAD_Y_TOP = 12;
const PAD_Y_BOT = 22;

export function CaffeineCurve({ sips, targets, day_key, now }: CaffeineCurveProps) {
  const dayStart = new Date(`${day_key}T00:00:00`);
  const dayStartIso = dayStart.toISOString();
  const samples = caffeineCurve(sips, dayStartIso, 15);
  const todays = sips.filter((s) => dayKey(s.logged_at) === day_key && s.mg > 0);
  const peak = Math.max(50, ...samples.map((s) => s.mg));
  const yMax = Math.ceil(peak / 50) * 50; // round up to nearest 50
  const innerW = VIEW_W - PAD_X * 2;
  const innerH = VIEW_H - PAD_Y_TOP - PAD_Y_BOT;

  const xForMinute = (m: number) => PAD_X + (m / (24 * 60)) * innerW;
  const yForMg = (mg: number) => PAD_Y_TOP + (1 - mg / yMax) * innerH;

  const path = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xForMinute(s.minute).toFixed(1)} ${yForMg(s.mg).toFixed(1)}`)
    .join(' ');

  const cutoffX = xForMinute(targets.caffeine_cutoff_hour * 60);
  const nowDate = now ?? new Date();
  const todayKey = dayKey(nowDate.toISOString());
  const showNow = todayKey === day_key;
  const nowMinute = nowDate.getHours() * 60 + nowDate.getMinutes();
  const nowX = xForMinute(nowMinute);

  const midnight = midnightResidual(sips, day_key);

  return (
    <section className="card curve-card" aria-label="Caffeine residual across the day">
      <header className="card-header">
        <p className="eyebrow">today · caffeine</p>
        <p className={`curve-midnight curve-midnight-${impactClass(midnight)}`}>
          {Math.round(midnight)} mg @ midnight
        </p>
      </header>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Caffeine residual curve. ${todays.length} dose${todays.length === 1 ? '' : 's'} today, predicted ${Math.round(midnight)} milligrams at midnight.`}
        className="curve-svg"
      >
        {/* baseline */}
        <line
          x1={PAD_X}
          y1={VIEW_H - PAD_Y_BOT}
          x2={VIEW_W - PAD_X}
          y2={VIEW_H - PAD_Y_BOT}
          className="curve-axis"
        />
        {/* cutoff line */}
        <line
          x1={cutoffX}
          y1={PAD_Y_TOP}
          x2={cutoffX}
          y2={VIEW_H - PAD_Y_BOT}
          className="curve-cutoff"
        />
        <text
          x={cutoffX + 3}
          y={PAD_Y_TOP + 9}
          className="curve-tick-label"
        >
          cutoff
        </text>
        {/* curve area */}
        <path
          d={`${path} L ${(VIEW_W - PAD_X).toFixed(1)} ${(VIEW_H - PAD_Y_BOT).toFixed(1)} L ${PAD_X.toFixed(1)} ${(VIEW_H - PAD_Y_BOT).toFixed(1)} Z`}
          className="curve-area"
        />
        <path d={path} className="curve-line" />
        {/* dose ticks */}
        {todays.map((s) => {
          const t = new Date(s.logged_at);
          const minute = t.getHours() * 60 + t.getMinutes();
          const x = xForMinute(minute);
          return (
            <g key={s.id}>
              <line
                x1={x}
                y1={VIEW_H - PAD_Y_BOT}
                x2={x}
                y2={VIEW_H - PAD_Y_BOT - 8}
                className="curve-dose"
              />
              <circle cx={x} cy={VIEW_H - PAD_Y_BOT - 10} r={3} className="curve-dose-dot" />
            </g>
          );
        })}
        {/* now indicator */}
        {showNow ? (
          <line
            x1={nowX}
            y1={PAD_Y_TOP}
            x2={nowX}
            y2={VIEW_H - PAD_Y_BOT}
            className="curve-now"
          />
        ) : null}
        {/* hour labels */}
        {[0, 6, 12, 18, 24].map((h) => (
          <text
            key={h}
            x={xForMinute(h * 60)}
            y={VIEW_H - 6}
            className="curve-tick-label"
            textAnchor="middle"
          >
            {h.toString().padStart(2, '0')}
          </text>
        ))}
      </svg>
    </section>
  );
}

function impactClass(mg: number): string {
  if (mg < 50) return 'clear';
  if (mg < 100) return 'mild';
  return 'high';
}
