/**
 * Live timer for an active cook. Updates every second, surfaces the
 * current stage prompt + the next upcoming one, and offers Mark cooked /
 * Cancel actions.
 *
 * Stage prompts are method-specific — built once per cook by
 * `lib/cook-time::buildStagePrompts`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  formatClock,
  formatDuration,
  METHOD_LABEL,
  CUTS,
  type Method,
} from '../data.ts';
import {
  buildStagePrompts,
  currentStagePrompt,
  nextStagePrompt,
} from '../lib/cook-time.ts';
import {
  estimatedFinishIso,
  secondsRemaining,
  type Cook,
} from '../db.ts';

interface CookTimerProps {
  cook: Cook;
  onMarkCooked(): void;
  onCancel(): void;
}

export function CookTimer({ cook, onMarkCooked, onCancel }: CookTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cut = useMemo(
    () => CUTS.find((c) => c.id === cook.cut_id),
    [cook.cut_id],
  );

  const prompts = useMemo(() => {
    if (!cut) return [];
    return buildStagePrompts(
      cut,
      cook.method as Method,
      cook.cook_minutes,
      cook.rest_minutes,
    );
  }, [cut, cook.method, cook.cook_minutes, cook.rest_minutes]);

  const startMs = new Date(cook.started_at).getTime();
  const elapsedSec = Math.max(0, Math.round((now - startMs) / 1000));
  const elapsedMin = Math.floor(elapsedSec / 60);
  const remainSec = secondsRemaining(cook, now);
  const finishedDisplay = new Date(estimatedFinishIso(cook)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const current = currentStagePrompt(prompts, elapsedMin);
  const next = nextStagePrompt(prompts, elapsedMin);

  const past = remainSec <= 0;

  return (
    <section className={`timer ${past ? 'timer--past' : ''}`}>
      <div className="timer-head">
        <p className="eyebrow">cooking now</p>
        <p className="timer-line">
          <strong>{cook.cut_name}</strong>
          <span className="muted small">
            {' · '}
            {METHOD_LABEL[cook.method]}
            {cook.doneness ? ` · ${cook.doneness}` : ''}
          </span>
        </p>
      </div>

      <div className="timer-clock">
        <p className="eyebrow">{past ? 'overshoot' : 'remaining'}</p>
        <p className="big-number">
          {past ? '+' : ''}
          {formatClock(Math.abs(remainSec))}
        </p>
        <p className="muted small">
          target {cook.target_temp_c}°C · est. ready {finishedDisplay} · started{' '}
          {new Date(cook.started_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {current ? (
        <div className="stage stage--active">
          <p className="eyebrow">stage · {formatDuration(elapsedMin)} in</p>
          <p className="stage-title">{current.title}</p>
          <p className="stage-body">{current.body}</p>
        </div>
      ) : null}

      {next ? (
        <div className="stage stage--upcoming">
          <p className="eyebrow">
            next in {formatDuration(Math.max(0, next.at_minute - elapsedMin))}
          </p>
          <p className="stage-title">{next.title}</p>
          <p className="stage-body">{next.body}</p>
        </div>
      ) : null}

      <div className="timer-actions">
        <button type="button" className="primary" onClick={onMarkCooked}>
          Mark cooked
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
