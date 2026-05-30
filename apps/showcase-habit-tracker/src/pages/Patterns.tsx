/**
 * Patterns — what tends to happen alongside what.
 *
 * The page reads from the same checkins + checks log the Today page
 * writes to. Insights are observations, not advice. Every card carries
 * a sample-size badge ("from 9 days") so the user can weigh confidence.
 */
import { useMemo } from 'react';
import { patternsFor } from '../lib/correlation.ts';
import type { Checkin, Habit, HabitCheck } from '../types.ts';

interface Props {
  habits: readonly Habit[];
  checks: readonly HabitCheck[];
  checkins: readonly Checkin[];
  onBack: () => void;
}

const MOVEMENT_INTENTS = new Set(['workout-completed', 'set-logged', 'pr-broken']);

export function Patterns({ habits, checks, checkins, onBack }: Props) {
  const movementHabitIds = useMemo(
    () =>
      habits
        .filter((h) => !h.archivedAt && h.cue?.intent && MOVEMENT_INTENTS.has(h.cue.intent))
        .map((h) => h.id),
    [habits],
  );
  const patterns = useMemo(
    () => patternsFor(checkins, checks, movementHabitIds),
    [checkins, checks, movementHabitIds],
  );
  const checkinCount = checkins.length;
  const ready = checkinCount >= 5;

  return (
    <section className="patterns">
      <header className="page-head with-back">
        <button type="button" className="back" onClick={onBack}>
          ← back
        </button>
        <div>
          <p className="eyebrow">Patterns</p>
          <h1>What tends to go together.</h1>
          <p className="muted">Quiet observations from your last few weeks. No advice.</p>
        </div>
      </header>

      {!ready ? (
        <article className="pattern-empty">
          <p>
            Five check-ins is the floor — patterns sharpen after about a week. You have
            {' '}
            <strong>{checkinCount}</strong>
            {' '}
            so far. Tap a slider on Today and come back.
          </p>
        </article>
      ) : null}

      {ready && patterns.length === 0 ? (
        <article className="pattern-empty">
          <p>
            Nothing strong enough to surface yet — your days look fairly balanced. The signal
            may sharpen with another week of check-ins.
          </p>
        </article>
      ) : null}

      <div className="patterns-grid">
        {patterns.map((p) => (
          <article key={p.id} className={`pattern-card pattern-tone-${p.tone}`}>
            <p className="pattern-headline">{p.headline}</p>
            {p.body ? <p className="pattern-body muted small">{p.body}</p> : null}
            <p className="pattern-sample mono small">
              Confidence: {p.sample} days
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
