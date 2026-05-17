import { useEffect, useMemo, useState } from 'react';
import {
  type Recipe,
  computeWeights,
  modeForLeaven,
  planFromReady,
  totalMinutes,
} from '../recipes.ts';
import { checkHydration } from '../lib/hydration-check.ts';
import { checkSalt } from '../lib/salt-check.ts';
import {
  flourLabel,
  leavenLabel,
} from '../lib/percentages.ts';
import {
  formatDayClock,
  formatHM,
} from '../lib/schedule.ts';
import { HydrationWarning } from '../components/HydrationWarning.tsx';
import { SaltWarning } from '../components/SaltWarning.tsx';
import { Timeline } from '../components/Timeline.tsx';

interface Props {
  recipe: Recipe;
  onCancel: () => void;
  onStart: (totalG: number, readyAt: Date) => void;
  onDelete?: () => void;
}

function defaultReadyTime(extraHoursAhead: number): string {
  const d = new Date();
  d.setHours(d.getHours() + extraHoursAhead, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Recipe({ recipe, onCancel, onStart, onDelete }: Props) {
  const total = useMemo(() => totalMinutes(recipe.stages), [recipe.stages]);
  const totalHours = Math.max(2, Math.ceil(total / 60));

  const [totalG, setTotalG] = useState<number>(recipe.defaultTotalG);
  const [readyAt, setReadyAt] = useState<string>(defaultReadyTime(totalHours + 1));
  const [expandedIdx, setExpandedIdx] = useState<number>(-1);
  const mode = modeForLeaven(recipe.leaven);

  // If the user picks a different recipe and revisits, reset the ready time
  // so the schedule never starts in the past.
  useEffect(() => {
    setReadyAt(defaultReadyTime(totalHours + 1));
  }, [recipe.id, totalHours]);

  const weights = useMemo(
    () => computeWeights(recipe, totalG),
    [recipe, totalG],
  );

  const readyDate = useMemo(() => {
    const t = new Date(readyAt);
    return isNaN(t.getTime())
      ? new Date(Date.now() + (totalHours + 1) * 60 * 60_000)
      : t;
  }, [readyAt, totalHours]);

  const plan = useMemo(
    () => planFromReady(recipe.stages, readyDate),
    [recipe.stages, readyDate],
  );

  const hydrationCheck = useMemo(
    () => checkHydration(recipe.flours, recipe.hydration),
    [recipe.flours, recipe.hydration],
  );
  const saltCheck = useMemo(() => checkSalt(recipe.salt), [recipe.salt]);

  const startsInPast = plan.startAt.getTime() < Date.now();

  return (
    <main className="app">
      <header className="page-header">
        <button type="button" className="back" onClick={onCancel}>
          ← Back
        </button>
        <h1>{recipe.name}</h1>
        <p className="subtitle">
          {mode} · {leavenLabel(recipe.leaven)} · {recipe.hydration}% hydration
        </p>
      </header>

      <section className="form-block">
        <p className="eyebrow">target</p>
        <div className="field-row">
          <label className="field">
            <span>total dough (g)</span>
            <input
              type="number"
              min={100}
              max={5000}
              step={50}
              value={totalG}
              onChange={(e) => setTotalG(Math.max(100, Number(e.target.value) || 100))}
            />
          </label>
          <label className="field">
            <span>ready at</span>
            <input
              type="datetime-local"
              value={readyAt}
              onChange={(e) => setReadyAt(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="quantities">
        <p className="eyebrow">to mix</p>
        <ul>
          {weights.flour_breakdown.map((f) => (
            <li key={f.kind}>
              <span className="qty-name">{flourLabel(f.kind)}</span>
              <span className="qty-value">{f.grams}g</span>
              <span className="muted small qty-pct">
                {recipe.flours.find((p) => p.kind === f.kind)?.pct ?? 0}%
              </span>
            </li>
          ))}
          <li className="qty-divider">
            <span className="qty-name">Total flour</span>
            <span className="qty-value">{weights.flour_g}g</span>
            <span className="muted small qty-pct">100%</span>
          </li>
          <li>
            <span className="qty-name">Water</span>
            <span className="qty-value">{weights.water_g}g</span>
            <span className="muted small qty-pct">{recipe.hydration}%</span>
          </li>
          <li>
            <span className="qty-name">Salt</span>
            <span className="qty-value">{weights.salt_g}g</span>
            <span className="muted small qty-pct">{recipe.salt}%</span>
          </li>
          <li>
            <span className="qty-name">{leavenLabel(recipe.leaven)}</span>
            <span className="qty-value">{weights.leaven_g}g</span>
            <span className="muted small qty-pct">{recipe.leavenPct}%</span>
          </li>
        </ul>
        <HydrationWarning check={hydrationCheck} />
        <SaltWarning check={saltCheck} />
      </section>

      <section className="schedule">
        <div className="strip-head">
          <p className="eyebrow">working backwards · {formatHM(total)}</p>
          <span className="muted small">
            start {formatDayClock(plan.startAt)}
          </span>
        </div>
        {mode === 'sourdough' ? (
          <p className="muted small starter-gate">
            <strong>Starter gate:</strong> feed your starter at a 1:5:5 refresh
            ahead of the levain build below. Skip if it's already ripe.
          </p>
        ) : null}
        {startsInPast ? (
          <p className="check-line warn" role="status">
            Start time is in the past — push "ready at" further out, or accept
            you'll be starting late.
          </p>
        ) : null}
        <Timeline
          plan={plan}
          expandedIndex={expandedIdx}
          onSelect={setExpandedIdx}
        />
      </section>

      <div className="page-actions">
        {onDelete ? (
          <button type="button" className="ghost destructive" onClick={onDelete}>
            Delete recipe
          </button>
        ) : null}
        <button
          type="button"
          className="primary"
          onClick={() => onStart(totalG, readyDate)}
          disabled={startsInPast}
        >
          Start ferment
        </button>
      </div>
    </main>
  );
}
