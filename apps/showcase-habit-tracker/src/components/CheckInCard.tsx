/**
 * CheckInCard — the 10-second daily check-in.
 *
 * Five soft sliders (mood / energy / stress / sleep / body) + an
 * optional one-line note. Every field is optional; the lightest
 * possible commitment is a single tap on one slider. The card
 * collapses to a single "Today" line once the user has logged
 * something for the day so it doesn't loom over the habit list.
 *
 * Voice-doc invariant: no "score". No "good". No "bad". The labels are
 * physical descriptors users can answer with their bodies — "dim" to
 * "bright", "frayed" to "settled" — so the card asks how you are, not
 * how you should be.
 */
import { useState, type ChangeEvent } from 'react';
import type { Checkin } from '../types.ts';

type Field = 'mood' | 'energy' | 'stress' | 'body';

const FIELD_META: Record<Field, { label: string; low: string; high: string; lowVerdictsAreSofter?: boolean }> = {
  mood: { label: 'Mood', low: 'dim', high: 'bright' },
  energy: { label: 'Energy', low: 'flat', high: 'lit' },
  // Stress is reversed: a high stress reading is the heavier verdict.
  stress: { label: 'Stress', low: 'settled', high: 'frayed', lowVerdictsAreSofter: true },
  body: { label: 'Body', low: 'sore', high: 'loose' },
};

interface Props {
  /** Today's check-in if it exists. Drives the collapsed-state summary. */
  today: Checkin | null;
  onChange: (next: Partial<Omit<Checkin, 'id' | 'date' | 'createdAt'>>) => void;
}

export function CheckInCard({ today, onChange }: Props) {
  const [expanded, setExpanded] = useState<boolean>(today == null);
  if (today && !expanded) {
    return (
      <article className="checkin-card checkin-card-compact" aria-label="Today's check-in">
        <button
          type="button"
          className="checkin-collapsed-summary"
          onClick={() => setExpanded(true)}
        >
          <span className="checkin-collapsed-eyebrow">Today</span>
          <span className="checkin-collapsed-line">{summary(today)}</span>
          <span className="checkin-collapsed-edit">edit</span>
        </button>
      </article>
    );
  }
  return (
    <article className="checkin-card" aria-label="Daily check-in">
      <header className="checkin-head">
        <p className="eyebrow">10 seconds</p>
        <h2>How are you, today?</h2>
        <p className="checkin-helper">Any single answer is enough.</p>
      </header>
      <div className="checkin-sliders" role="group" aria-label="Daily check-in sliders">
        {(['mood', 'energy', 'stress', 'body'] as Field[]).map((field) => (
          <Slider
            key={field}
            label={FIELD_META[field].label}
            low={FIELD_META[field].low}
            high={FIELD_META[field].high}
            value={today?.[field]}
            onChange={(v) => onChange({ [field]: v } as Partial<Checkin>)}
          />
        ))}
        <SleepInput
          value={today?.sleepHours}
          onChange={(v) => onChange({ sleepHours: v })}
        />
      </div>
      <textarea
        className="checkin-note"
        placeholder="One line — optional"
        value={today?.note ?? ''}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ note: event.target.value })}
        rows={2}
        aria-label="One-line note"
      />
      {today ? (
        <button
          type="button"
          className="checkin-collapse"
          onClick={() => setExpanded(false)}
        >
          done
        </button>
      ) : null}
    </article>
  );
}

interface SliderProps {
  label: string;
  low: string;
  high: string;
  value?: number;
  onChange: (value: number) => void;
}

function Slider({ label, low, high, value, onChange }: SliderProps) {
  return (
    <div className="checkin-slider">
      <div className="checkin-slider-head">
        <span className="checkin-slider-label">{label}</span>
        <span className="checkin-slider-value">{value ?? '—'}</span>
      </div>
      <div className="checkin-slider-row">
        <span className="checkin-slider-anchor checkin-slider-anchor-low">{low}</span>
        <div className="checkin-slider-stops" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((stop) => (
            <button
              key={stop}
              type="button"
              role="radio"
              aria-checked={value === stop}
              aria-label={`${label} ${stop} of 5`}
              className={`checkin-stop ${value === stop ? 'is-active' : ''}`}
              onClick={() => onChange(stop)}
            >
              {stop}
            </button>
          ))}
        </div>
        <span className="checkin-slider-anchor checkin-slider-anchor-high">{high}</span>
      </div>
    </div>
  );
}

interface SleepInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function SleepInput({ value, onChange }: SleepInputProps) {
  return (
    <div className="checkin-slider">
      <div className="checkin-slider-head">
        <span className="checkin-slider-label">Sleep</span>
        <span className="checkin-slider-value">{value != null ? `${value} h` : '—'}</span>
      </div>
      <div className="checkin-slider-row checkin-sleep-row">
        {[5, 6, 7, 8, 9].map((h) => (
          <button
            key={h}
            type="button"
            className={`checkin-stop ${value === h ? 'is-active' : ''}`}
            onClick={() => onChange(value === h ? undefined : h)}
            aria-label={`${h} hours of sleep`}
          >
            {h}h
          </button>
        ))}
      </div>
    </div>
  );
}

function summary(c: Checkin): string {
  const parts: string[] = [];
  if (typeof c.mood === 'number') parts.push(`mood ${c.mood}`);
  if (typeof c.energy === 'number') parts.push(`energy ${c.energy}`);
  if (typeof c.sleepHours === 'number') parts.push(`${c.sleepHours}h`);
  if (typeof c.stress === 'number') parts.push(`stress ${c.stress}`);
  if (typeof c.body === 'number') parts.push(`body ${c.body}`);
  if (parts.length === 0) return 'noted';
  return parts.join(' · ');
}
